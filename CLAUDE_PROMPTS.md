# Claude Code Prompts & Commands

Quick reference for working with Claude Code on this portfolio.

## Starting a New Project

### 1. Create Project Structure

```bash
./new-project.sh
```

### 2. Initial Prompt to Claude

```
Let's work on [project-name]. Please follow the guidelines in `.claude-instructions.md`
and use `CHECKLIST.md` to track our progress.

First, help me fill out docs/PRD.md and docs/ARCHITECTURE.md for this project:
[Describe what you want to build]
```

## During Development

### Request Following Standards

```
Please ensure this code follows the standards in `.claude-instructions.md`:
- Python: Black formatting, type hints, docstrings
- JavaScript: Prettier formatting, ES6+
- Meaningful variable names
- Comments explain WHY not WHAT
```

### Before Each Commit

```
Please review the code changes against CHECKLIST.md before we commit:
- No debug statements (console.log, print)
- No hardcoded secrets
- Proper error handling
- Code is formatted
```

**With TuringMind AI Review (Recommended):**

```
/turingmind:review
```

This runs a quick AI-powered code review checking for:

- Bugs & logic errors (null access, off-by-one, race conditions)
- Security vulnerabilities (SQL injection, XSS, hardcoded secrets)
- Architecture violations
- Project-specific compliance

**For Pull Requests:**

```
/turingmind:deep-review
```

Comprehensive analysis with architecture and impact assessment.

### Documentation Review

```
Please review the documentation in README.md, PRD.md, and ARCHITECTURE.md
to ensure they're complete and accurate for this project.
```

### Check Completion Status

```
Please review CHECKLIST.md and tell me what's remaining before this project
is ready to ship.
```

## Specific Tasks

### Creating Documentation

```
Please create/update [README.md/PRD.md/ARCHITECTURE.md] for this project
following the template and guidelines.
```

### Code Review

```
Please review this code for:
1. Code quality (following .claude-instructions.md)
2. Security issues (no secrets, input validation)
3. Documentation completeness
4. Test coverage
```

### Adding Features

```
I want to add [feature]. Please:
1. Update docs/PRD.md with the user story
2. Update docs/ARCHITECTURE.md with design changes
3. Implement the feature following our standards
4. Update README.md with usage examples
```

### Git Commits

```
Please create a commit with all changes following our commit message format:

<type>: <summary>

<description>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

## Security Review

### Comprehensive Security Check

```
Please perform a comprehensive security review of this project:
1. Check SECURITY_GUIDELINES.md for all applicable security requirements
2. Verify no hardcoded API keys, passwords, or secrets
3. Ensure all user input is validated and sanitized
4. Check for SQL injection vulnerabilities (parameterized queries)
5. Verify XSS prevention is implemented
6. Review authentication and authorization logic
7. Check that error messages don't leak sensitive information
8. Scan dependencies with npm audit or pip-audit
9. Review against OWASP Top 10:2025
10. Update the Security Review section in CHECKLIST.md
```

### Check for Hardcoded Secrets

```
Please scan the entire project for hardcoded secrets:
- Search for patterns like API_KEY, PASSWORD, SECRET, TOKEN
- Check for hardcoded URLs with credentials
- Verify all sensitive values are in environment variables
- Ensure .env is in .gitignore
- Confirm .env.example is provided without real secrets
```

### OWASP Top 10:2025 Review

```
Review this project against OWASP Top 10:2025:
1. Broken Access Control - Are authorization checks in place?
2. Security Misconfiguration - Is debug mode disabled? Headers secure?
3. Software Supply Chain - Dependencies scanned and up to date?
4. Cryptographic Failures - Passwords hashed properly? HTTPS used?
5. Injection - SQL queries parameterized? Input sanitized?
6. Insecure Design - Security considered in architecture?
7. Authentication Failures - Strong password policy? Rate limiting?
8. Data Integrity - Code signing? Integrity checks?
9. Logging Failures - Security events logged? Sensitive data not logged?
10. SSRF - External URLs validated and whitelisted?

Report any vulnerabilities and suggest fixes.
```

### Dependency Security Scan

```
Please scan dependencies for security vulnerabilities:
1. Run npm audit or pip-audit
2. Report any critical or high severity issues
3. Suggest updates or fixes
4. Check if all dependencies are actively maintained
5. Identify any unnecessary dependencies to remove
```

### Input Validation Review

```
Review all user input handling in this project:
1. List all endpoints/functions that accept user input
2. Verify each has proper validation
3. Check for whitelist validation (not just blacklist)
4. Ensure type checking and bounds validation
5. Verify SQL injection prevention
6. Check XSS prevention
7. Validate file upload restrictions (if applicable)
```

## Completion Phase

### Final Review

```
This project is ready for completion. Please:
1. Verify all items in CHECKLIST.md are done (including Security Review)
2. Review README.md for completeness
3. Ensure no TODO comments in code
4. Check all documentation is accurate
5. Confirm SECURITY_GUIDELINES.md requirements are met
6. Update the main portfolio README with this project
```

### Create GitHub Issue

```
Please help me create a GitHub issue for this project using the
"New Project" template with appropriate details.
```

## Troubleshooting

### Pre-commit Issues

```
The pre-commit hooks are failing. Please:
1. Show me what's failing
2. Fix the issues
3. Ensure the code follows our standards
```

### Documentation Out of Sync

```
The code has changed since the documentation was written.
Please update [README.md/ARCHITECTURE.md/PRD.md] to match the current implementation.
```

## Pro Tips

### Always Remind About Standards

Start each coding session with:

```
Please review `.claude-instructions.md` before we start coding today.
```

### Regular Check-ins

Periodically ask:

```
Are we following all the guidelines in `.claude-instructions.md`?
Check our progress against CHECKLIST.md.
```

### Before Finishing

Always request:

```
Before we wrap up, please ensure:
- All code is committed
- Documentation is complete
- CHECKLIST.md is updated
- No debug code remains
```

## Template Phrases

Copy-paste these as needed:

**Start of session:**

> Working on [project-name]. Follow `.claude-instructions.md` and track progress in `CHECKLIST.md`.

**During coding:**

> Please ensure this follows our coding standards in `.claude-instructions.md`.

**Before commit:**

> Review changes against `CHECKLIST.md` before committing.

**Completion:**

> Final review using `CHECKLIST.md`. Update main README. Close GitHub issue.

---

**Remember**: The more specific you are about following the standards,
the more consistent and professional your portfolio will be!
