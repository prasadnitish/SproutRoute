# Project Development Checklist

Use this checklist to ensure you follow all portfolio standards.

## Planning Phase

- [ ] Created GitHub issue using "New Project" template
- [ ] Filled out [docs/PRD.md](docs/PRD.md) with:
  - [ ] Problem statement
  - [ ] User stories
  - [ ] Success metrics
  - [ ] Requirements
- [ ] Filled out [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) with:
  - [ ] System design diagram
  - [ ] Key design decisions
  - [ ] Trade-offs considered
- [ ] Updated [README.md](README.md) with project overview

## Development Phase

- [ ] Code follows style guidelines:
  - [ ] Python: Black formatting (max line 100)
  - [ ] JavaScript: Prettier formatting
  - [ ] Meaningful variable names
  - [ ] Functions are small and focused
- [ ] Comments explain WHY, not WHAT
- [ ] No console.log or debug code left in
- [ ] No secrets or API keys committed
- [ ] Environment variables in `.env.example`
- [ ] Pre-commit hooks pass before each commit
- [ ] Git commits follow conventional format:

  ```
  <type>: <short summary>

  <optional detailed description>
  ```

## Security Review

⚠️ **CRITICAL**: Review [SECURITY_GUIDELINES.md](../SECURITY_GUIDELINES.md) before deployment

- [ ] **Secrets Management**
  - [ ] No hardcoded API keys, passwords, or secrets in code
  - [ ] All sensitive config in environment variables
  - [ ] `.env.example` provided (without actual secrets)
  - [ ] `.env` file in `.gitignore`
  - [ ] No secrets in git history
- [ ] **Input Validation**
  - [ ] All user input validated and sanitized
  - [ ] SQL queries use parameterized statements (if applicable)
  - [ ] XSS prevention implemented for user-generated content
  - [ ] File uploads restricted to safe types (if applicable)
- [ ] **Authentication & Authorization**
  - [ ] Passwords hashed with bcrypt/argon2 (if applicable)
  - [ ] Authorization checks on protected routes
  - [ ] Rate limiting on sensitive endpoints
  - [ ] Session management is secure (if applicable)
- [ ] **Error Handling**
  - [ ] Error messages don't leak sensitive information
  - [ ] Stack traces not exposed to users
  - [ ] Debug mode disabled for production
- [ ] **Dependencies**
  - [ ] Run `npm audit` or `pip-audit` with no critical issues
  - [ ] Dependencies up to date
  - [ ] Lock files committed (package-lock.json, requirements.txt)
- [ ] **OWASP Top 10:2025**
  - [ ] Reviewed applicable vulnerabilities for this project
  - [ ] Broken Access Control mitigated
  - [ ] Security Misconfiguration checked

## Documentation Phase

- [ ] README.md is complete with:
  - [ ] Clear problem statement
  - [ ] Setup instructions that work
  - [ ] Usage examples
  - [ ] Screenshots or demo link
  - [ ] Tech stack listed
  - [ ] Key learnings documented
- [ ] ARCHITECTURE.md shows system design
- [ ] PRD.md reflects final implementation
- [ ] Code has meaningful comments
- [ ] API endpoints documented (if applicable)

## Testing & Quality

- [ ] Core functionality works end-to-end
- [ ] Error handling implemented
- [ ] Edge cases considered
- [ ] Tests written (if applicable)
- [ ] Run `pre-commit run --all-files` passes

## Completion

- [ ] All MVP features from PRD implemented
- [ ] Screenshots/demo added to README
- [ ] Learnings section completed
- [ ] Main portfolio README.md updated with new project
- [ ] GitHub issue closed
- [ ] Applied appropriate labels to issue

## Before Sharing with Recruiters

- [ ] No broken functionality
- [ ] Professional code quality
- [ ] Documentation is clear and typo-free
- [ ] Repository is public
- [ ] README makes sense to someone unfamiliar with the project

---

**Tip**: Copy this checklist into your GitHub issue and track progress there!
