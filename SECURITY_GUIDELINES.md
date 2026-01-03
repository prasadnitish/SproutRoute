# Security Guidelines for TPM Portfolio Projects

**Last Updated:** January 2026 | Based on OWASP Top 10:2025 and 2026 Industry Best Practices

## Introduction

Security isn't optional—it's a core requirement for any professional software project. This guide provides practical, actionable security guidelines for your portfolio projects. These practices demonstrate to recruiters that you understand not just how to build features, but how to build them **securely**.

> **Key Principle**: Security must be built-in from the start, not added later.

---

## Table of Contents

1. [Secrets & API Key Management](#secrets--api-key-management)
2. [OWASP Top 10:2025 Vulnerabilities](#owasp-top-102025-vulnerabilities)
3. [Language-Specific Security](#language-specific-security)
4. [Input Validation & Sanitization](#input-validation--sanitization)
5. [Authentication & Authorization](#authentication--authorization)
6. [Dependency & Supply Chain Security](#dependency--supply-chain-security)
7. [Error Handling & Logging](#error-handling--logging)
8. [Security Testing Tools](#security-testing-tools)
9. [Pre-Deployment Security Checklist](#pre-deployment-security-checklist)

---

## Secrets & API Key Management

### The Golden Rule: NEVER Hardcode Secrets

❌ **NEVER DO THIS:**

\`\`\`python

# BAD - Hardcoded API key

API_KEY = "sk-1234567890abcdef"
openai.api_key = "sk-1234567890abcdef"
\`\`\`

\`\`\`javascript
// BAD - Hardcoded credentials
const DB_PASSWORD = "mypassword123";
const STRIPE_KEY = "sk_live_abc123";
\`\`\`

### ✅ Use Environment Variables

**Python:**

\`\`\`python
import os
from dotenv import load_dotenv

load_dotenv() # Load from .env file

API_KEY = os.getenv("OPENAI_API_KEY")
if not API_KEY:
raise ValueError("OPENAI_API_KEY environment variable not set")
\`\`\`

**JavaScript/Node.js:**

\`\`\`javascript
require("dotenv").config();

const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) {
throw new Error("OPENAI_API_KEY environment variable not set");
}
\`\`\`

### .env File Structure

**Create `.env` (NEVER commit this):**

\`\`\`bash

# .env - DO NOT COMMIT

OPENAI_API_KEY=sk-1234567890abcdef
DATABASE_URL=postgresql://user:password@localhost/db
STRIPE_SECRET_KEY=sk_live_abc123
\`\`\`

**Create `.env.example` (Safe to commit):**

\`\`\`bash

# .env.example - Safe to commit

OPENAI_API_KEY=your_openai_api_key_here
DATABASE_URL=your_database_url_here
STRIPE_SECRET_KEY=your_stripe_secret_key_here
\`\`\`

### .gitignore Protection

Ensure your `.gitignore` includes:

\`\`\`
.env
.env.local
\*.env
\`\`\`

### Client-Side vs Server-Side

⚠️ **CRITICAL**: Never expose API keys in client-side code (browser, mobile apps).

❌ **WRONG:**

\`\`\`javascript
// BAD - Exposed in browser
const apiKey = "sk-1234567890abcdef";
fetch(`https://api.service.com/data?key=${apiKey}`);
\`\`\`

✅ **CORRECT:**

\`\`\`javascript
// Client-side: Call your own backend
fetch("/api/data"); // Your backend handles the API key

// Server-side (Node.js backend):
app.get("/api/data", async (req, res) => {
const apiKey = process.env.API_KEY; // Secure on server
const response = await fetch(`https://api.service.com/data`, {
headers: { Authorization: `Bearer ${apiKey}` },
});
res.json(await response.json());
});
\`\`\`

### Secrets Management Systems

For production applications, use:

- **AWS Secrets Manager**
- **Azure Key Vault**
- **Google Cloud Secret Manager**
- **HashiCorp Vault**
- **GitHub Secrets** (for CI/CD)

### Key Rotation Schedule

Rotate API keys regularly:

- **Critical systems**: Every 30 days
- **Standard applications**: Every 60-90 days
- **Immediately** if a key is compromised

### Git Repository Risks

⚠️ **WARNING**: If a secret is committed to git, it's exposed **forever** in the history.

**If you accidentally commit a secret:**

1. **Revoke the key immediately** on the service
2. Generate a new key
3. Use `git filter-branch` or `BFG Repo-Cleaner` to remove from history
4. Force push (if you must, and you're the only one using the repo)

**Prevention**: Use pre-commit hooks (see [Security Testing Tools](#security-testing-tools))

---

## OWASP Top 10:2025 Vulnerabilities

The OWASP Top 10 represents the most critical web application security risks. Here's how they apply to your portfolio projects.

### 1. Broken Access Control (A01:2025)

**Risk:** Users can access resources or perform actions they shouldn't be authorized for.

**Example:**

\`\`\`python

# BAD - No authorization check

@app.route('/user/<user_id>/profile')
def get_user_profile(user_id):
user = User.query.get(user_id)
return jsonify(user.to_dict())
\`\`\`

**Fix:**

\`\`\`python

# GOOD - Verify user owns the resource

@app.route('/user/<user_id>/profile')
@login_required
def get_user_profile(user_id):
if current_user.id != int(user_id):
abort(403) # Forbidden
user = User.query.get(user_id)
return jsonify(user.to_dict())
\`\`\`

**Prevention:**

- Deny access by default
- Implement proper authorization checks
- Don't rely on client-side checks alone
- Use role-based access control (RBAC)

### 2. Security Misconfiguration (A02:2025)

**Risk:** Insecure default configurations, unnecessary features enabled, or verbose error messages.

**Examples:**

❌ Debug mode in production
❌ Default admin passwords
❌ Directory listing enabled
❌ Unnecessary services running

**Prevention:**

\`\`\`python

# Python/Flask - Disable debug in production

if os.getenv('FLASK_ENV') == 'production':
app.debug = False
\`\`\`

\`\`\`javascript
// Node.js - Set secure headers
const helmet = require("helmet");
app.use(helmet());
\`\`\`

### 3. Software Supply Chain Failures (A03:2025)

**Risk:** Vulnerable dependencies, compromised packages, or lack of integrity verification.

**Prevention:**

- **Use lock files**: `package-lock.json`, `requirements.txt` with pinned versions
- **Regular audits**: `npm audit`, `pip-audit`
- **Review before adding**: Check package popularity, maintenance, and security
- **Use SRI (Subresource Integrity)** for CDN resources

\`\`\`bash

# Check for vulnerabilities

npm audit
pip-audit

# Update dependencies

npm update
pip install --upgrade -r requirements.txt
\`\`\`

### 4. Cryptographic Failures (A04:2025)

**Risk:** Weak encryption, insecure data transmission, or improper key management.

**Examples:**

❌ Using MD5 or SHA1 for passwords
❌ HTTP instead of HTTPS
❌ Storing passwords in plaintext

**Prevention:**

\`\`\`python

# GOOD - Use bcrypt for password hashing

from bcrypt import hashpw, gensalt, checkpw

# Hash password

hashed = hashpw(password.encode('utf-8'), gensalt())

# Verify password

if checkpw(password.encode('utf-8'), stored_hash):
print("Password correct")
\`\`\`

\`\`\`javascript
// GOOD - Use bcrypt in Node.js
const bcrypt = require("bcrypt");

// Hash password
const hash = await bcrypt.hash(password, 10);

// Verify password
const isValid = await bcrypt.compare(password, hash);
\`\`\`

### 5. Injection (A05:2025)

**Risk:** SQL injection, command injection, XSS attacks through untrusted input.

#### SQL Injection

❌ **NEVER DO THIS:**

\`\`\`python

# DANGEROUS - SQL Injection vulnerability

query = f"SELECT \* FROM users WHERE username = '{username}'"
cursor.execute(query)
\`\`\`

✅ **ALWAYS DO THIS:**

\`\`\`python

# SAFE - Parameterized query

query = "SELECT \* FROM users WHERE username = %s"
cursor.execute(query, (username,))
\`\`\`

#### XSS (Cross-Site Scripting)

**Prevent XSS in templates:**

\`\`\`python

# Flask/Jinja2 - Auto-escapes by default

{{ user_input }} # Safe - auto-escaped

# Manually escape if needed

from markupsafe import escape
safe_text = escape(user_input)
\`\`\`

\`\`\`javascript
// React - Auto-escapes by default

<div>{userInput}</div> // Safe

// Vanilla JS - Escape manually
function escapeHtml(text) {
const div = document.createElement("div");
div.textContent = text;
return div.innerHTML;
}
\`\`\`

### 6. Insecure Design (A06:2025)

**Risk:** Fundamental flaws in application architecture.

**Prevention:**

- Threat modeling during design phase
- Secure design patterns
- Principle of least privilege
- Defense in depth (multiple security layers)

**Document design decisions in `docs/ARCHITECTURE.md`**

### 7. Authentication Failures (A07:2025)

**Risk:** Weak authentication, credential stuffing, session management issues.

**Prevention:**

- Strong password requirements (min 12 characters)
- Rate limiting on login attempts
- Multi-factor authentication (MFA) for sensitive apps
- Secure session management
- Account lockout after failed attempts

\`\`\`python

# Example: Rate limiting with Flask-Limiter

from flask_limiter import Limiter

limiter = Limiter(app, key_func=lambda: request.remote_addr)

@app.route('/login', methods=['POST'])
@limiter.limit("5 per minute") # Max 5 attempts per minute
def login(): # Login logic here
pass
\`\`\`

### 8. Software & Data Integrity Failures (A08:2025)

**Risk:** Insecure CI/CD pipelines, auto-updates without verification.

**Prevention:**

- Code signing
- Verify package integrity (checksums, signatures)
- Secure CI/CD pipelines
- Immutable infrastructure

### 9. Security Logging & Alerting Failures (A09:2025)

**Risk:** Insufficient logging, lack of monitoring, delayed breach detection.

**Prevention:**

\`\`\`python

# Log security events

import logging

logging.warning(f"Failed login attempt for user: {username} from IP: {request.remote_addr}")
logging.info(f"User {user.id} accessed sensitive resource")
\`\`\`

**What to log:**

- Authentication attempts (success and failure)
- Authorization failures
- Input validation failures
- Sensitive data access

**What NOT to log:**

- Passwords
- API keys
- Credit card numbers
- Personal identifiable information (PII)

### 10. Server-Side Request Forgery (SSRF) (A10:2025)

**Risk:** Application fetches remote resources without validating user-supplied URLs.

**Example vulnerability:**

\`\`\`python

# BAD - SSRF vulnerability

@app.route('/fetch')
def fetch_url():
url = request.args.get('url')
response = requests.get(url) # Dangerous!
return response.text
\`\`\`

**Prevention:**

\`\`\`python

# GOOD - Whitelist allowed domains

ALLOWED_DOMAINS = ['api.example.com', 'data.example.com']

@app.route('/fetch')
def fetch_url():
url = request.args.get('url')
parsed = urlparse(url)

    if parsed.netloc not in ALLOWED_DOMAINS:
        abort(400, "Domain not allowed")

    response = requests.get(url, timeout=5)
    return response.text

\`\`\`

---

## Language-Specific Security

### Python Security

#### 1. SQL Injection Prevention

\`\`\`python

# ALWAYS use parameterized queries

cursor.execute("SELECT \* FROM users WHERE id = %s", (user_id,))

# With SQLAlchemy ORM (safe)

user = User.query.filter_by(id=user_id).first()
\`\`\`

#### 2. Path Traversal Protection

\`\`\`python
from pathlib import Path

# Prevent directory traversal

def safe_read_file(filename):
base_dir = Path("/safe/upload/dir")
file_path = (base_dir / filename).resolve()

    # Ensure file is within base directory
    if not file_path.is_relative_to(base_dir):
        raise ValueError("Invalid file path")

    return file_path.read_text()

\`\`\`

#### 3. Avoid Pickle with Untrusted Data

\`\`\`python

# NEVER unpickle untrusted data

# pickle.loads(untrusted_data) # DANGEROUS!

# Use JSON instead

import json
data = json.loads(untrusted_data)
\`\`\`

#### 4. Avoid eval() and exec()

\`\`\`python

# NEVER use eval with user input

# result = eval(user_expression) # DANGEROUS!

# Use ast.literal_eval for safe evaluation of literals

from ast import literal_eval
result = literal_eval("{'key': 'value'}") # Safe
\`\`\`

#### 5. Dependency Scanning

\`\`\`bash

# Install pip-audit

pip install pip-audit

# Scan for vulnerabilities

pip-audit

# Or use safety

pip install safety
safety check
\`\`\`

### JavaScript/Node.js Security

#### 1. XSS Prevention

\`\`\`javascript
// Use DOMPurify for sanitizing HTML
import DOMPurify from "dompurify";

const clean = DOMPurify.sanitize(dirtyHTML);
\`\`\`

#### 2. Prototype Pollution Prevention

\`\`\`javascript
// Avoid using user input as object keys
const obj = {};
// obj[userInput] = value; // Risky

// Use Map instead
const map = new Map();
map.set(userInput, value); // Safer
\`\`\`

#### 3. Regular Expression DoS (ReDoS)

\`\`\`javascript
// AVOID - Vulnerable to ReDoS
const regex = /^(a+)+$/;

// BETTER - Use simple patterns
const regex = /^a+$/;

// Or use safe-regex to test
npm install safe-regex
\`\`\`

#### 4. Content Security Policy (CSP)

\`\`\`javascript
// Use helmet for security headers
const helmet = require("helmet");
app.use(
helmet.contentSecurityPolicy({
directives: {
defaultSrc: ["'self'"],
scriptSrc: ["'self'", "'unsafe-inline'"],
styleSrc: ["'self'", "'unsafe-inline'"],
imgSrc: ["'self'", "data:", "https:"],
},
})
);
\`\`\`

#### 5. npm Audit

\`\`\`bash

# Check for vulnerabilities

npm audit

# Fix automatically (when possible)

npm audit fix

# For breaking changes

npm audit fix --force
\`\`\`

---

## Input Validation & Sanitization

### Whitelist vs Blacklist

✅ **Prefer Whitelisting** (allow known good)
❌ **Avoid Blacklisting** (block known bad)

\`\`\`python

# GOOD - Whitelist allowed characters

import re

def validate*username(username):
if not re.match(r'^[a-zA-Z0-9*]{3,20}$', username):
raise ValueError("Invalid username format")
return username
\`\`\`

### Type Checking and Bounds

\`\`\`python
def set_age(age):
age = int(age) # Type conversion
if not (0 < age < 150): # Bounds checking
raise ValueError("Invalid age")
return age
\`\`\`

### File Upload Validation

\`\`\`python
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}

def allowed_file(filename):
return '.' in filename and \
 filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/upload', methods=['POST'])
def upload_file():
file = request.files['file']

    if not file or not allowed_file(file.filename):
        abort(400, "Invalid file type")

    # Save securely
    filename = secure_filename(file.filename)
    file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))

\`\`\`

---

## Authentication & Authorization

### Password Hashing

**Always use:**

- bcrypt
- argon2
- scrypt

**Never use:**

- MD5
- SHA1
- Plain text

### JWT Best Practices

\`\`\`javascript
const jwt = require("jsonwebtoken");

// Create token with expiration
const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
expiresIn: "1h",
});

// Verify token
try {
const decoded = jwt.verify(token, process.env.JWT_SECRET);
console.log(decoded.userId);
} catch (err) {
// Token invalid or expired
console.error("Invalid token");
}
\`\`\`

### Session Management

- Use secure, httpOnly cookies
- Regenerate session ID after login
- Implement session timeout
- Clear session on logout

### Rate Limiting

\`\`\`javascript
const rateLimit = require("express-rate-limit");

const limiter = rateLimit({
windowMs: 15 _ 60 _ 1000, // 15 minutes
max: 100, // Limit each IP to 100 requests per windowMs
});

app.use("/api/", limiter);
\`\`\`

---

## Dependency & Supply Chain Security

### Lock Files

Always commit lock files:

- `package-lock.json` (npm)
- `yarn.lock` (Yarn)
- `requirements.txt` with pinned versions (Python)

### Regular Updates

\`\`\`bash

# Check outdated packages

npm outdated
pip list --outdated

# Update carefully (test after updating!)

npm update
pip install --upgrade package-name
\`\`\`

### Avoid Typosquatting

Double-check package names before installing:

- `requests` ✅ vs `request` ❌
- `python-jose` ✅ vs `jose` ❌

### Review Dependencies

Before adding a new dependency:

- Check npm/PyPI downloads
- Review GitHub stars and activity
- Check for known vulnerabilities
- Evaluate if you really need it

---

## Error Handling & Logging

### Don't Expose Stack Traces

❌ **BAD:**

\`\`\`python
@app.errorhandler(500)
def handle_error(e):
return str(e), 500 # Exposes internal details!
\`\`\`

✅ **GOOD:**

\`\`\`python
@app.errorhandler(500)
def handle_error(e): # Log full error server-side
app.logger.error(f"Error: {str(e)}")

    # Return generic message to user
    return {"error": "Internal server error"}, 500

\`\`\`

### Sanitize Error Messages

\`\`\`python

# Don't reveal database structure

# "Table 'users' doesn't exist" # BAD

# Generic error instead

"Database query failed" # GOOD
\`\`\`

### What NOT to Log

❌ Passwords
❌ API keys
❌ Credit card numbers
❌ Social Security numbers
❌ Session tokens

✅ What TO log:

- Timestamp
- User ID (not username)
- Action performed
- IP address
- Success/failure status

---

## Security Testing Tools

### Pre-Commit Hooks

Install secret detection:

\`\`\`bash

# Install detect-secrets

pip install detect-secrets

# Add to .pre-commit-config.yaml

- repo: https://github.com/Yelp/detect-secrets
  rev: v1.4.0
  hooks: - id: detect-secrets
  \`\`\`

### Static Analysis (SAST)

**Python:**

\`\`\`bash

# Bandit - Security linter

pip install bandit
bandit -r src/

# Semgrep - Advanced static analysis

pip install semgrep
semgrep --config=auto src/
\`\`\`

**JavaScript:**

\`\`\`bash

# ESLint with security plugin

npm install --save-dev eslint eslint-plugin-security

# .eslintrc.json

{
"plugins": ["security"],
"extends": ["plugin:security/recommended"]
}
\`\`\`

### Dependency Scanning

\`\`\`bash

# Python

pip-audit

# Node.js

npm audit

# Or use Snyk (works for both)

npm install -g snyk
snyk test
\`\`\`

### Secret Scanning

**GitGuardian** (free for public repos)
**TruffleHog** (open source)

\`\`\`bash

# Install TruffleHog

pip install trufflehog

# Scan repository

trufflehog filesystem /path/to/repo
\`\`\`

### API Security Testing

**OWASP ZAP** (free, open source)

\`\`\`bash

# Docker

docker run -t owasp/zap2docker-stable zap-baseline.py -t http://localhost:3000
\`\`\`

---

## Pre-Deployment Security Checklist

Before deploying or sharing your portfolio project:

### Secrets & Configuration

- [ ] No hardcoded API keys or passwords
- [ ] All secrets in environment variables
- [ ] `.env.example` provided (without real secrets)
- [ ] `.env` in `.gitignore`
- [ ] No secrets in git history

### Input Validation

- [ ] All user input validated
- [ ] SQL queries use parameterized statements
- [ ] File uploads restricted to safe types
- [ ] User input sanitized before display (XSS prevention)

### Authentication & Authorization

- [ ] Passwords properly hashed (bcrypt/argon2)
- [ ] Authorization checks on all protected routes
- [ ] Session management secure
- [ ] Rate limiting implemented on sensitive endpoints

### Dependencies

- [ ] `npm audit` or `pip-audit` run with no critical issues
- [ ] Dependencies up to date
- [ ] Lock files committed

### Error Handling

- [ ] Debug mode disabled in production
- [ ] Error messages don't leak sensitive info
- [ ] Stack traces not exposed to users
- [ ] Logging doesn't include secrets/PII

### HTTPS & Headers

- [ ] HTTPS enforced (for deployed apps)
- [ ] Security headers configured (helmet.js for Node)
- [ ] CORS properly configured

### Code Quality

- [ ] Pre-commit hooks passing
- [ ] No console.log or print debug statements
- [ ] Dead code removed
- [ ] Comments don't include sensitive info

### Testing

- [ ] Core security features tested
- [ ] Authentication/authorization tested
- [ ] Input validation tested with edge cases

---

## Additional Resources

### Learn More

- [OWASP Top 10:2025](https://owasp.org/Top10/2025/)
- [API Security Best Practices (GitGuardian)](https://blog.gitguardian.com/secrets-api-management/)
- [Node.js Security Best Practices 2026](https://www.sparkleweb.in/blog/node.js_security_best_practices_for_2026)
- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/)

### Tools

- **SAST**: Bandit (Python), Semgrep, ESLint Security
- **Dependency Scanning**: npm audit, pip-audit, Snyk
- **Secret Detection**: GitGuardian, TruffleHog, detect-secrets
- **API Testing**: OWASP ZAP, Burp Suite

---

## Summary

Security is not optional—it's a core skill that separates amateur projects from professional ones. By following these guidelines:

1. **Never hardcode secrets** - use environment variables
2. **Validate all input** - whitelist allowed values
3. **Use parameterized queries** - prevent SQL injection
4. **Hash passwords properly** - bcrypt or argon2
5. **Keep dependencies updated** - run regular audits
6. **Handle errors securely** - don't leak internal details
7. **Test your security** - use automated tools

**Remember**: Recruiters review your code. Demonstrating security awareness shows professionalism and production-readiness.

---

_This guide is based on 2026 industry best practices and OWASP Top 10:2025. Security is constantly evolving—stay informed and keep learning._
