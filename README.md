# 🛡️ GitRadar — Enterprise SCA & CIS Controls v8 Compliance Platform

[![.NET 10](https://img.shields.io/badge/.NET-10.0-512BD4?logo=dotnet&logoColor=white)](https://dotnet.microsoft.com/)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![CIS Controls v8](https://img.shields.io/badge/CIS%20Controls%20v8-Safeguard%2016.4%20%26%2016.6-008080.svg)](https://www.cisecurity.org/controls)
[![Google OSV](https://img.shields.io/badge/Google%20OSV-API%20Integration-4285F4?logo=google&logoColor=white)](https://osv.dev/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**GitRadar** is an automated, high-throughput **Software Composition Analysis (SCA)** and continuous dependency security governance platform designed for modern enterprise environments. Built on **.NET 10** and **React 19**, it operationalizes **CIS Controls v8 Safeguards 16.4 and 16.6**, turning repository discovery, Software Bill of Materials (SBOM) cataloging, and vulnerability triage into an automated, auditable engineering process.

---

## 🌟 Key Features

- **Automated Repository & Dependency Discovery:** Deep inspection of active and legacy codebases with zero clone requirements via GitHub REST API tree walks.
- **Enterprise Ecosystem Engine (NuGet & Beyond):** Bound-checked byte stream parsers (`BoundedReadStream`) for `.csproj`, `Directory.Build.props`, `Directory.Packages.props` (CPM - Central Package Management), and legacy `packages.config` with ReDoS/Zip-Bomb mitigations.
- **Google OSV (Open Source Vulnerabilities) Advisory Feed:** Real-time vulnerability correlation with batch querying (`/v1/querybatch`), automatic rate-limiting, CVSS v3.1/v3.0 vector parsing, and SLA tier computation.
- **CIS Controls v8 Compliance:**
  - **Safeguard 16.4:** Immutable Software Bill of Materials (SBOM) tracking using RFC-standard Package URLs (`pkg:nuget/...`).
  - **Safeguard 16.6:** Automated vulnerability assessment, enterprise remediation SLAs (P1/Critical: 7 days, P2/High: 14 days, P3/Medium: 30 days, P4/Low: 90 days), and vulnerability triage states.
- **Microsoft Entra ID (Azure AD) SSO:** Enterprise identity integration with JWT role-based access control (RBAC) and pre-authorized security governance.
- **Modern Security Operations Center (SOC) UI:** High-performance responsive frontend built with React 19, TailwindCSS, dual-theme (Dark/Light mode), and full WCAG accessibility support.

---

## 🏛️ Architectural Overview

GitRadar strictly adheres to **Clean Architecture** and Domain-Driven Design (DDD) principles:

```
+-------------------------------------------------------------+
|                      Presentation Layer                     |
|    GitRadar.API (REST Web API)  |  Frontend (React 19 + UI)  |
+-------------------------------------------------------------+
                              |
+-------------------------------------------------------------+
|                      Application Layer                      |
|                  GitRadar.Application (CQRS)                |
+-------------------------------------------------------------+
          /                   |                   \
+--------------------+ +-------------------+ +--------------------+
| Scanning Core      | | Persistence       | | Advisory OSV       |
| GitRadar.Scanning  | | GitRadar.         | | GitRadar.          |
| Abstractions & Core| | Persistence (EF)  | | Advisory.OSV       |
+--------------------+ +-------------------+ +--------------------+
          |                   |
+-------------------------------------------------------------+
|                        Domain Layer                         |
|                      GitRadar.Domain                        |
+-------------------------------------------------------------+
```

### Core Architecture Highlights

1. **Inward Dependency Flow:** Inner domain entities have zero external package dependencies.
2. **Defensive Streaming Engine:** Manifests are read via memory-capped bounded streams (`BoundedReadStream`, 10MB limit) preventing memory exhaustion attacks from malicious pull requests.
3. **Resilient HTTP Pipelines:** Google OSV API client uses exponential backoff and Polly resilience pipelines with in-memory caching to eliminate rate limit starvation.

---

## 🚀 Quick Start & Installation

### Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0)
- [Node.js (v20+ or v22 LTS)](https://nodejs.org/) & `npm`
- [SQL Server](https://www.microsoft.com/sql-server/) (or LocalDB / SQL Server Express)

### 1. Clone & Configure

```bash
git clone https://github.com/your-username/GitRadar.git
cd GitRadar
```

### 2. Configure Backend Secrets

Edit `Backend/src/GitRadar.API/appsettings.json`:

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Server=.\\SQLEXPRESS;Database=GitRadarDb;Trusted_Connection=True;MultipleActiveResultSets=true;TrustServerCertificate=True"
  },
  "GitHub": {
    "PersonalAccessToken": "YOUR_GITHUB_PAT_HERE"
  },
  "Jwt": {
    "SecretKey": "YOUR_STRONG_32_CHAR_SECRET_KEY_HERE"
  },
  "AzureAd": {
    "TenantId": "YOUR_AZURE_TENANT_ID",
    "ClientId": "YOUR_AZURE_CLIENT_ID",
    "ClientSecret": "YOUR_AZURE_CLIENT_SECRET"
  }
}
```

### 3. Run Database Migrations & Start Backend

```bash
cd Backend
dotnet restore GitRadar.sln
dotnet ef database update --project src/GitRadar.Persistence --startup-project src/GitRadar.API
dotnet run --project src/GitRadar.API
```
*The API portal will be available at `http://localhost:5000` with Swagger UI at `/swagger`.*

### 4. Start Frontend Application

```bash
cd ../Frontend
npm install
npm run dev
```
*The frontend dashboard will be available at `http://localhost:5173`.*

---

## 🧪 Testing & Verification

Run the entire automated unit test suite across advisory parsers, CVSS scoring, and NuGet manifest decoders:

```bash
cd Backend
dotnet test GitRadar.sln --logger "console;verbosity=detailed"
```

---

## 🔒 Security & Privacy Notice

This repository represents a sanitized public release of GitRadar:
- All sensitive corporate credentials, API keys, tokens, and tenant identifiers have been replaced with safe template placeholders.
- Real-world production secrets must be supplied via environment variables (`ASPNETCORE_...`) or Azure Key Vault / AWS Secrets Manager.

---

## 📄 License

Distributed under the [MIT License](LICENSE).
