namespace GitRadar.Infrastructure.Streams;

/// <summary>
/// Bir akıştan okunan toplam bayt miktarını kesin olarak sınırlayan ve belirlenen üst sınırı
/// aştığında güvenli istisna fırlatan salt okunur akış sarmalayıcısıdır.
/// Sıfır disk kullanımı (Zero Disk I/O) prensibine uygun bellek güvenliği sağlar.
/// </summary>
public sealed class BoundedReadStream : Stream
{
    private readonly Stream _innerStream;
    private readonly long _maxBytes;
    private long _bytesRead;
    private bool _isDisposed;

    public BoundedReadStream(Stream innerStream, long maxBytes)
    {
        ArgumentNullException.ThrowIfNull(innerStream);

        if (maxBytes <= 0)
            throw new ArgumentOutOfRangeException(nameof(maxBytes), "Maksimum bayt sınırı pozitif bir değer olmalıdır.");

        _innerStream = innerStream;
        _maxBytes = maxBytes;
    }

    public override bool CanRead => !_isDisposed && _innerStream.CanRead;
    public override bool CanSeek => false;
    public override bool CanWrite => false;
    public override long Length => _innerStream.CanSeek ? _innerStream.Length : throw new NotSupportedException("Akış üzerinde Length desteklenmiyor.");

    public override long Position
    {
        get => _bytesRead;
        set => throw new NotSupportedException("BoundedReadStream üzerinde konum değiştirilemez.");
    }

    public override void Flush() => _innerStream.Flush();
    public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException("BoundedReadStream seek desteklemez.");
    public override void SetLength(long value) => throw new NotSupportedException("BoundedReadStream salt okunurdur.");
    public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException("BoundedReadStream salt okunurdur.");

    public override int Read(byte[] buffer, int offset, int count)
    {
        ObjectDisposedException.ThrowIf(_isDisposed, this);
        ValidateBufferArguments(buffer, offset, count);

        if (count == 0)
            return 0;

        if (_bytesRead >= _maxBytes)
        {
            var probe = _innerStream.ReadByte();
            if (probe == -1)
            {
                return 0; // Gerçek EOF
            }

            throw new MaxManifestSizeExceededException(_bytesRead + 1, _maxBytes);
        }

        var toRead = (int)Math.Min((long)count, _maxBytes - _bytesRead);
        var bytesRead = _innerStream.Read(buffer, offset, toRead);

        if (bytesRead > 0)
        {
            _bytesRead += bytesRead;
        }

        return bytesRead;
    }

    public override int Read(Span<byte> buffer)
    {
        ObjectDisposedException.ThrowIf(_isDisposed, this);

        if (buffer.IsEmpty)
            return 0;

        if (_bytesRead >= _maxBytes)
        {
            Span<byte> probe = stackalloc byte[1];
            var probeRead = _innerStream.Read(probe);
            if (probeRead == 0)
            {
                return 0;
            }

            throw new MaxManifestSizeExceededException(_bytesRead + 1, _maxBytes);
        }

        var toRead = (int)Math.Min((long)buffer.Length, _maxBytes - _bytesRead);
        var bytesRead = _innerStream.Read(buffer[..toRead]);

        if (bytesRead > 0)
        {
            _bytesRead += bytesRead;
        }

        return bytesRead;
    }

    public override async Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken)
    {
        ObjectDisposedException.ThrowIf(_isDisposed, this);
        ValidateBufferArguments(buffer, offset, count);

        if (count == 0)
            return 0;

        cancellationToken.ThrowIfCancellationRequested();

        if (_bytesRead >= _maxBytes)
        {
            var probeBuffer = new byte[1];
            var probeRead = await _innerStream.ReadAsync(probeBuffer, 0, 1, cancellationToken).ConfigureAwait(false);
            if (probeRead == 0)
            {
                return 0;
            }

            throw new MaxManifestSizeExceededException(_bytesRead + 1, _maxBytes);
        }

        var toRead = (int)Math.Min((long)count, _maxBytes - _bytesRead);
        var bytesRead = await _innerStream.ReadAsync(buffer, offset, toRead, cancellationToken).ConfigureAwait(false);

        if (bytesRead > 0)
        {
            _bytesRead += bytesRead;
        }

        return bytesRead;
    }

    public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
    {
        ObjectDisposedException.ThrowIf(_isDisposed, this);

        if (buffer.IsEmpty)
            return 0;

        cancellationToken.ThrowIfCancellationRequested();

        if (_bytesRead >= _maxBytes)
        {
            Memory<byte> probe = new byte[1];
            var probeRead = await _innerStream.ReadAsync(probe, cancellationToken).ConfigureAwait(false);
            if (probeRead == 0)
            {
                return 0;
            }

            throw new MaxManifestSizeExceededException(_bytesRead + 1, _maxBytes);
        }

        var toRead = (int)Math.Min((long)buffer.Length, _maxBytes - _bytesRead);
        var bytesRead = await _innerStream.ReadAsync(buffer[..toRead], cancellationToken).ConfigureAwait(false);

        if (bytesRead > 0)
        {
            _bytesRead += bytesRead;
        }

        return bytesRead;
    }

    public override int ReadByte()
    {
        ObjectDisposedException.ThrowIf(_isDisposed, this);

        if (_bytesRead >= _maxBytes)
        {
            var probe = _innerStream.ReadByte();
            if (probe == -1)
            {
                return -1;
            }

            throw new MaxManifestSizeExceededException(_bytesRead + 1, _maxBytes);
        }

        var b = _innerStream.ReadByte();
        if (b != -1)
        {
            _bytesRead++;
        }

        return b;
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _isDisposed = true;
        }

        base.Dispose(disposing);
    }

    public override ValueTask DisposeAsync()
    {
        _isDisposed = true;
        GC.SuppressFinalize(this);
        return ValueTask.CompletedTask;
    }
}

/// <summary>
/// Manifest akışının izin verilen fiziksel üst sınırı aştığını belirten özel istisna türüdür.
/// </summary>
public sealed class MaxManifestSizeExceededException : InvalidOperationException
{
    public long BytesRead { get; }
    public long MaxBytes { get; }

    public MaxManifestSizeExceededException(long bytesRead, long maxBytes)
        : base($"Manifest akış boyutu ({bytesRead:N0} bayt) izin verilen güvenli üst sınırı ({maxBytes:N0} bayt) aştı.")
    {
        BytesRead = bytesRead;
        MaxBytes = maxBytes;
    }
}
