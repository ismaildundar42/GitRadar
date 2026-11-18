using System.Text;
using GitRadar.Scanner.NuGet.Parsers;
using Xunit;

namespace GitRadar.Scanner.NuGet.Tests.Streams;

public sealed class BoundedReadStreamTests
{
    [Fact]
    public void Scenario1_UnderLimit_ReadsDataSuccessfullyWithoutLoss()
    {
        // Arrange
        const int dataSize = 10 * 1024; // 10 KB
        var originalData = new byte[dataSize];
        new Random(42).NextBytes(originalData);

        using var innerStream = new MemoryStream(originalData);
        using var boundedStream = new BoundedReadStream(innerStream, 50 * 1024 * 1024); // 50 MB limit

        using var outputStream = new MemoryStream();
        var buffer = new byte[1024];
        int bytesRead;

        // Act
        while ((bytesRead = boundedStream.Read(buffer, 0, buffer.Length)) > 0)
        {
            outputStream.Write(buffer, 0, bytesRead);
        }

        // Assert
        Assert.Equal(dataSize, boundedStream.Position);
        Assert.Equal(originalData, outputStream.ToArray());
    }

    [Fact]
    public async Task Scenario1_UnderLimit_AsyncRead_ReadsDataSuccessfullyWithoutLoss()
    {
        // Arrange
        var content = "GitRadar high-performance SCA scanning test payload";
        var originalBytes = Encoding.UTF8.GetBytes(content);

        using var innerStream = new MemoryStream(originalBytes);
        using var boundedStream = new BoundedReadStream(innerStream, 50 * 1024 * 1024);

        var buffer = new byte[128];

        // Act
        var bytesRead = await boundedStream.ReadAsync(buffer, 0, buffer.Length);
        var readContent = Encoding.UTF8.GetString(buffer, 0, bytesRead);

        // Assert
        Assert.Equal(content, readContent);
    }

    [Fact]
    public void Scenario2_LimitExceeded_ThrowsInvalidOperationExceptionAndHaltsRead()
    {
        // Arrange
        const long maxLimit = 1000;
        var data = new byte[1500]; // 1500 bytes exceeds 1000 bytes limit
        using var innerStream = new MemoryStream(data);
        using var boundedStream = new BoundedReadStream(innerStream, maxLimit);

        var buffer = new byte[600];

        // Act & Assert
        // First chunk reads 600 bytes
        var firstRead = boundedStream.Read(buffer, 0, buffer.Length);
        Assert.Equal(600, firstRead);

        // Second chunk attempts to read remaining, clamps to 400 bytes
        var secondRead = boundedStream.Read(buffer, 0, buffer.Length);
        Assert.Equal(400, secondRead);
        Assert.Equal(maxLimit, boundedStream.Position);

        // Third read triggers probe beyond maxLimit and must throw MaxManifestSizeExceededException (derived from InvalidOperationException)
        var ex = Assert.Throws<MaxManifestSizeExceededException>(() => boundedStream.Read(buffer, 0, buffer.Length));
        Assert.IsAssignableFrom<InvalidOperationException>(ex);
        Assert.Equal(maxLimit + 1, ex.BytesRead);
        Assert.Equal(maxLimit, ex.MaxBytes);
    }

    [Fact]
    public async Task Scenario2_LimitExceeded_AsyncRead_ThrowsInvalidOperationException()
    {
        // Arrange
        const long maxLimit = 500;
        var data = new byte[600];
        using var innerStream = new MemoryStream(data);
        using var boundedStream = new BoundedReadStream(innerStream, maxLimit);

        var buffer = new byte[500];
        var firstRead = await boundedStream.ReadAsync(buffer, 0, buffer.Length);
        Assert.Equal(500, firstRead);

        // Next async read detects stream has more bytes beyond limit
        await Assert.ThrowsAsync<MaxManifestSizeExceededException>(async () =>
        {
            _ = await boundedStream.ReadAsync(buffer, 0, buffer.Length);
        });
    }

    [Fact]
    public void Scenario3_ExactBoundary_ReturnsEofWithoutException()
    {
        // Arrange
        const long maxLimit = 512;
        var exactData = new byte[maxLimit];
        using var innerStream = new MemoryStream(exactData);
        using var boundedStream = new BoundedReadStream(innerStream, maxLimit);

        var buffer = new byte[256];

        // Read all 512 bytes in two chunks
        var read1 = boundedStream.Read(buffer, 0, buffer.Length);
        var read2 = boundedStream.Read(buffer, 0, buffer.Length);
        Assert.Equal(512, read1 + read2);
        Assert.Equal(maxLimit, boundedStream.Position);

        // Act: At exact boundary, EOF is probed. Inner stream returns EOF (-1), so bounded stream returns 0 (EOF)
        var eofRead = boundedStream.Read(buffer, 0, buffer.Length);
        var eofByte = boundedStream.ReadByte();

        // Assert
        Assert.Equal(0, eofRead);
        Assert.Equal(-1, eofByte);
    }

    [Fact]
    public void Scenario3_BoundaryPlusOneByte_ThrowsMaxManifestSizeExceededException()
    {
        // Arrange: Exactly 512 + 1 = 513 bytes
        const long maxLimit = 512;
        var data = new byte[maxLimit + 1];
        using var innerStream = new MemoryStream(data);
        using var boundedStream = new BoundedReadStream(innerStream, maxLimit);

        var buffer = new byte[512];
        var read = boundedStream.Read(buffer, 0, buffer.Length);
        Assert.Equal(512, read);

        // Act & Assert: Reading when capacity is full discovers the 513th byte
        Assert.Throws<MaxManifestSizeExceededException>(() => boundedStream.Read(buffer, 0, buffer.Length));
    }

    [Fact]
    public void Scenario4_ZeroByteRead_DoesNotConsumeBudgetOrChangePosition()
    {
        // Arrange
        const long maxLimit = 1000;
        var data = new byte[500];
        using var innerStream = new MemoryStream(data);
        using var boundedStream = new BoundedReadStream(innerStream, maxLimit);

        // Act
        var readBytes = boundedStream.Read(new byte[10], 0, 0);
        var readSpan = boundedStream.Read(Span<byte>.Empty);

        // Assert
        Assert.Equal(0, readBytes);
        Assert.Equal(0, readSpan);
        Assert.Equal(0, boundedStream.Position);

        // Subsequent valid read should read full amount from beginning
        var actualBuffer = new byte[100];
        var actualRead = boundedStream.Read(actualBuffer, 0, actualBuffer.Length);
        Assert.Equal(100, actualRead);
        Assert.Equal(100, boundedStream.Position);
    }

    [Fact]
    public async Task Scenario4_ZeroByteRead_Async_DoesNotConsumeBudget()
    {
        // Arrange
        const long maxLimit = 1000;
        var data = new byte[500];
        using var innerStream = new MemoryStream(data);
        using var boundedStream = new BoundedReadStream(innerStream, maxLimit);

        // Act
        var readBytes = await boundedStream.ReadAsync(new byte[10], 0, 0);
        var readMemory = await boundedStream.ReadAsync(Memory<byte>.Empty);

        // Assert
        Assert.Equal(0, readBytes);
        Assert.Equal(0, readMemory);
        Assert.Equal(0, boundedStream.Position);
    }

    [Fact]
    public void Scenario5_PostDispose_ThrowsObjectDisposedException()
    {
        // Arrange
        var innerStream = new MemoryStream(new byte[100]);
        var boundedStream = new BoundedReadStream(innerStream, 1000);

        // Act
        boundedStream.Dispose();

        // Assert
        Assert.False(boundedStream.CanRead);
        var buffer = new byte[10];
        Assert.Throws<ObjectDisposedException>(() => boundedStream.Read(buffer, 0, buffer.Length));
        Assert.Throws<ObjectDisposedException>(() => boundedStream.Read(buffer.AsSpan()));
        Assert.Throws<ObjectDisposedException>(() => boundedStream.ReadByte());
    }

    [Fact]
    public async Task Scenario5_PostDispose_AsyncRead_ThrowsObjectDisposedException()
    {
        // Arrange
        var innerStream = new MemoryStream(new byte[100]);
        var boundedStream = new BoundedReadStream(innerStream, 1000);

        // Act
        boundedStream.Dispose();

        // Assert
        Assert.False(boundedStream.CanRead);
        var buffer = new byte[10];
        await Assert.ThrowsAsync<ObjectDisposedException>(async () =>
        {
            _ = await boundedStream.ReadAsync(buffer, 0, buffer.Length);
        });
        await Assert.ThrowsAsync<ObjectDisposedException>(async () =>
        {
            _ = await boundedStream.ReadAsync(buffer.AsMemory());
        });
    }

    [Fact]
    public async Task Scenario5_PostDisposeAsync_ThrowsObjectDisposedException()
    {
        // Arrange
        var innerStream = new MemoryStream(new byte[100]);
        var boundedStream = new BoundedReadStream(innerStream, 1000);

        // Act
        await boundedStream.DisposeAsync();

        // Assert
        Assert.False(boundedStream.CanRead);
        var buffer = new byte[10];
        Assert.Throws<ObjectDisposedException>(() => boundedStream.Read(buffer, 0, buffer.Length));
        await Assert.ThrowsAsync<ObjectDisposedException>(async () =>
        {
            _ = await boundedStream.ReadAsync(buffer.AsMemory());
        });
    }

    [Fact]
    public void Scenario6_OwnershipProtection_UnderlyingStreamRemainsOpenAfterDispose()
    {
        // Arrange
        var innerStream = new MemoryStream(Encoding.UTF8.GetBytes("Test Payload for Stream Ownership"));
        var boundedStream = new BoundedReadStream(innerStream, 1000);

        // Act
        boundedStream.Dispose();

        // Assert: Underlying stream remains open and usable by caller
        Assert.True(innerStream.CanRead);
        Assert.True(innerStream.CanSeek);
        innerStream.Position = 0;
        var readByte = innerStream.ReadByte();
        Assert.Equal((int)'T', readByte);
    }

    [Fact]
    public async Task Scenario6_OwnershipProtection_UnderlyingStreamRemainsOpenAfterDisposeAsync()
    {
        // Arrange
        var innerStream = new MemoryStream(Encoding.UTF8.GetBytes("Async Test Payload for Stream Ownership"));
        var boundedStream = new BoundedReadStream(innerStream, 1000);

        // Act
        await boundedStream.DisposeAsync();

        // Assert: Underlying stream remains open and usable by caller
        Assert.True(innerStream.CanRead);
        var buffer = new byte[5];
        var read = await innerStream.ReadAsync(buffer);
        Assert.Equal(5, read);
    }
}
