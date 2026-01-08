# TuringMind Code Review Setup Guide

## What is TuringMind?

TuringMind is an AI-powered code review skill for Claude Code that catches bugs, security vulnerabilities, and architecture issues before you commit. It complements automated linters by catching semantic issues that static analysis tools miss.

**Repository:** [turingmindai/turingmind-code-review](https://github.com/turingmindai/turingmind-code-review)

---

## Installation

### Step 1: Add Marketplace Source

In your Claude Code interface, run:

```
/plugin marketplace add turingmindai/turingmind-code-review
```

### Step 2: Install the Skill

```
/plugin install turingmind@turingmind
```

### Step 3: Verify Installation

```
/plugin list
```

You should see `turingmind@turingmind` listed with two commands:

- `/turingmind:review`
- `/turingmind:deep-review`

---

## How to Use

### Quick Review (Pre-Commit)

Before committing code, run:

```
/turingmind:review
```

**What it checks:**

- **Bugs & Logic:** Null/undefined access, off-by-one errors, race conditions, resource leaks
- **Security:** SQL injection, XSS, hardcoded secrets, authentication bypass (OWASP Top 10)
- **Compliance:** Project-specific rules and team conventions
- **Basic Architecture:** Pattern consistency

**Review Speed:** ~30-60 seconds
**Agents Used:** 4 Claude Sonnet agents

**Best for:**

- Quick pre-commit checks
- Daily development workflow
- Catching obvious issues fast

---

### Deep Review (Pull Requests)

For comprehensive analysis before merging, run:

```
/turingmind:deep-review
```

**Additional checks:**

- **Architecture Analysis:** Abstraction violations, circular dependencies, coupling issues
- **Impact Assessment:** How changes affect existing code
- **Multi-file Data Flow:** Complex state management and API interactions

**Review Speed:** ~2-3 minutes
**Agents Used:** 6 Claude Sonnet + 3 Haiku agents

**Best for:**

- Pull request reviews
- Major refactoring
- Pre-deployment checks
- Architecture validation

---

## Recommended Workflow

### Daily Development

```bash
# 1. Make your changes
git add .

# 2. Run quick review
/turingmind:review

# 3. Fix any issues found
# (edit files based on feedback)

# 4. Re-review if needed
/turingmind:review

# 5. Commit
git commit -m "feat: add new feature"
```

### Pull Request Creation

```bash
# 1. Ensure all changes are staged
git add .

# 2. Run deep review
/turingmind:deep-review

# 3. Address all findings
# (fix bugs, security issues, architecture problems)

# 4. Run quick review to verify fixes
/turingmind:review

# 5. Create pull request
gh pr create
```

---

## What TuringMind Catches

### ✅ Will Catch

**Logic Errors:**

- Null/undefined dereferencing
- Off-by-one errors in loops
- Race conditions in async code
- Resource leaks (unclosed files, connections)
- Type coercion bugs

**Security Issues:**

- SQL injection vulnerabilities
- XSS vulnerabilities
- Command injection
- Hardcoded API keys and passwords
- Authentication/authorization bypass
- Insecure file handling

**Architecture Problems:**

- Inconsistent patterns
- Abstraction violations
- Circular dependencies
- Tight coupling
- Missing error handling

**Project Rules:**

- Naming convention violations
- Missing documentation
- Test coverage gaps
- Inconsistent formatting (semantic, not whitespace)

### ❌ Won't Catch (By Design)

**Pre-existing Issues:**

- Problems in unchanged files
- Legacy code issues

**Linter Territory:**

- Whitespace and formatting
- Unused imports
- Syntax errors

**Requires Execution:**

- Runtime performance issues
- Test failures
- Integration problems

**Out of Scope:**

- Complex multi-file data flows (limited in quick review)
- Third-party library vulnerabilities (use npm audit/pip-audit)
- Infrastructure configuration issues

---

## Integration with Portfolio Workflow

### Update CHECKLIST.md

Add TuringMind reviews to your project checklist:

```markdown
## Code Review Phase

- [ ] Run `/turingmind:review` on all changes
- [ ] Fix all critical issues (bugs, security)
- [ ] Address important issues (architecture, patterns)
- [ ] Consider suggestions (minor improvements)
- [ ] Run `/turingmind:deep-review` before PR
```

### Update Pre-Commit Process

In your `.claude-instructions.md`, add:

```markdown
## Code Review Process

1. **Before committing:**

   - Run `/turingmind:review`
   - Fix all critical and important issues
   - Re-run review to verify fixes

2. **Before creating PR:**
   - Run `/turingmind:deep-review`
   - Address all architecture and impact findings
   - Run quick review for final check
```

---

## Understanding Review Output

### Issue Severity Levels

**🔴 CRITICAL** - Must fix before committing

- Security vulnerabilities
- Data corruption risks
- Breaking changes

**🟡 IMPORTANT** - Should fix before merging

- Code clarity issues
- Performance problems
- Best practice violations

**🔵 SUGGESTION** - Consider for improvement

- Minor refactoring ideas
- Style improvements
- Alternative approaches

### False Positives

TuringMind includes false-positive filtering to avoid:

- Flagging intentional patterns
- Reporting linter-territory issues
- Duplicating existing tool warnings

If you encounter a false positive, the skill learns from context to avoid similar reports.

---

## Limitations

### Known Limitations

1. **AI-Assisted, Not Perfect:**

   - May miss complex issues
   - Can produce false positives
   - Complements, doesn't replace security tools

2. **Scope Constraints:**

   - Only reviews uncommitted changes
   - Limited visibility into unchanged files
   - Cannot trace complex multi-file flows

3. **Performance:**
   - Quick review: 30-60 seconds
   - Deep review: 2-3 minutes
   - Requires active Claude Code session

### Use Alongside Other Tools

TuringMind complements (not replaces):

- **Static Analysis:** ESLint, Pylint, Flake8
- **Security Scanning:** npm audit, pip-audit, Snyk
- **Type Checking:** TypeScript, mypy
- **Testing:** Jest, pytest, unit tests
- **Pre-commit Hooks:** Formatting, secret detection

---

## Troubleshooting

### "Command not found" Error

**Problem:** `/turingmind:review` not recognized

**Solutions:**

1. Verify installation: `/plugin list`
2. Reinstall: `/plugin install turingmind@turingmind`
3. Restart Claude Code

### Review Takes Too Long

**Problem:** Review hangs or times out

**Solutions:**

1. Ensure changes are staged: `git add .`
2. Check for very large diffs (review smaller chunks)
3. Use quick review first, deep review only when needed

### Too Many False Positives

**Problem:** Review flags intentional patterns

**Solutions:**

1. Add context in code comments explaining the pattern
2. Report to TuringMind team (GitHub issues)
3. Use deep review for better context understanding

### No Issues Found (But You Expected Some)

**Problem:** Review returns clean when issues exist

**Solutions:**

1. Ensure changes are staged: `git status`
2. Check if issues are in unchanged files (out of scope)
3. Run deep review for more thorough analysis
4. Use dedicated security tools for vulnerability scanning

---

## Best Practices

### 1. Review Early and Often

✅ **Do:**

- Run quick review after each feature
- Review before every commit
- Use deep review for PRs

❌ **Don't:**

- Wait until end of day to review
- Skip review for "small changes"
- Only review before deployment

### 2. Fix Issues Promptly

✅ **Do:**

- Address critical issues immediately
- Document why you skip suggestions
- Re-review after fixes

❌ **Don't:**

- Accumulate review debt
- Ignore security warnings
- Commit without re-verification

### 3. Understand the Feedback

✅ **Do:**

- Read full explanations
- Ask follow-up questions
- Learn from recurring issues

❌ **Don't:**

- Auto-fix without understanding
- Blindly accept all suggestions
- Ignore architecture warnings

### 4. Combine with Other Tools

✅ **Do:**

- Use linters for style
- Use security scanners for dependencies
- Use TuringMind for semantic issues

❌ **Don't:**

- Rely solely on AI review
- Skip automated testing
- Ignore tool recommendations

---

## Additional Resources

- **Documentation:** [GitHub README](https://github.com/turingmindai/turingmind-code-review)
- **Issues:** [GitHub Issues](https://github.com/turingmindai/turingmind-code-review/issues)
- **License:** MIT

---

## Quick Reference

```bash
# Quick pre-commit review (30-60s)
/turingmind:review

# Comprehensive PR review (2-3min)
/turingmind:deep-review

# Check installation
/plugin list

# Reinstall if needed
/plugin install turingmind@turingmind
```

---

**Remember:** TuringMind is a powerful tool, but it's AI-assisted code review that complements (not replaces) your judgment, automated tools, and security scanning. Use it as part of a comprehensive quality assurance process.
