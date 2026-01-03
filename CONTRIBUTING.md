# Contributing to Your Portfolio

This guide helps you maintain consistency and quality across your portfolio projects.

## Development Workflow

### Starting a New Project

1. **Create an issue** using the "New Project" template
2. **Copy the template**: `cp -r _project-template your-project-name`
3. **Plan thoroughly**: Fill out PRD.md and ARCHITECTURE.md
4. **Start coding**: Add your implementation to `src/`
5. **Document as you go**: Update README with setup steps and learnings

### Git Workflow

#### Commit Messages

Follow this format for clear, professional commits:

```
<type>: <short summary>

<optional detailed description>

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

**Types:**

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `refactor`: Code refactoring
- `test`: Adding tests
- `chore`: Maintenance tasks

**Examples:**

```bash
git commit -m "feat: Add user authentication endpoint

Implements JWT-based authentication with login and logout endpoints.
Includes password hashing and token validation."

git commit -m "docs: Update API documentation with new endpoints"

git commit -m "fix: Resolve CORS issue in API middleware"
```

#### Branch Strategy (Optional)

For complex projects, use branches:

```bash
# Create feature branch
git checkout -b feature/user-auth

# Work on your feature
git add .
git commit -m "feat: Add authentication logic"

# Merge back to main
git checkout main
git merge feature/user-auth
git push
```

## Code Quality Standards

### Pre-commit Hooks

Pre-commit hooks are installed and will automatically:

- Format Python code with Black
- Format JavaScript with Prettier
- Check for trailing whitespace
- Validate JSON and YAML
- Detect accidentally committed secrets

**To run manually:**

```bash
pre-commit run --all-files
```

### Code Style

**Python:**

- Use Black for formatting (max line length: 100)
- Follow PEP 8 conventions
- Add docstrings to functions and classes
- Type hints encouraged

**JavaScript:**

- Use Prettier for formatting
- Use ES6+ features
- Consistent naming (camelCase for variables, PascalCase for classes)

**General:**

- Keep functions small and focused
- Use meaningful variable names
- Comment complex logic
- Remove dead code

## Documentation Requirements

Every project should have:

### 1. README.md

- Clear problem statement
- Setup instructions that work
- Usage examples
- Screenshots or demo
- Learnings section

### 2. docs/PRD.md

- User stories
- Success metrics
- Requirements

### 3. docs/ARCHITECTURE.md

- System design
- Key decisions and trade-offs
- API endpoints (if applicable)

### 4. Code Comments

- Explain WHY, not WHAT
- Document assumptions
- Note future improvements

## Testing

While not always required for portfolio projects, consider adding tests for:

- Complex business logic
- API endpoints
- Critical user flows

**Python:**

```bash
pytest tests/
```

**JavaScript:**

```bash
npm test
```

## Project Completion Checklist

Before marking a project as complete:

- [ ] All features from PRD implemented
- [ ] README is comprehensive and accurate
- [ ] Code is clean and well-commented
- [ ] No console.log or debug code left in
- [ ] Screenshots/demo added
- [ ] Architecture documented
- [ ] Learnings section completed
- [ ] Main portfolio README updated
- [ ] GitHub issue closed

## Labels Usage

Apply relevant labels to your issues:

**Status:**

- `planning` - Design and planning phase
- `in-progress` - Active development
- `completed` - Finished

**Type:**

- `project` - New portfolio project
- `bug` - Something broken
- `enhancement` - Improvement to existing project
- `documentation` - Docs updates

**Tech:**

- `python` - Python projects
- `javascript` - JavaScript projects
- `fullstack` - Full-stack projects
- `api` - API-related work

## Showing Your Work

### For Recruiters

When sharing your portfolio:

1. **Point to specific projects** that match the role
2. **Highlight the README** - this shows communication skills
3. **Explain your decisions** in ARCHITECTURE.md
4. **Show learnings** - what you figured out along the way

### LinkedIn Posts

After completing a project:

```
🚀 Just completed [Project Name]!

Built a [brief description] using [tech stack].

Key challenges:
• [Challenge 1]
• [Challenge 2]

What I learned:
• [Learning 1]
• [Learning 2]

Check it out: [GitHub link]

#TechnicalProductManagement #ProductManager #BuildInPublic
```

## Best Practices

### Do:

✅ Commit frequently with clear messages
✅ Document decisions as you make them
✅ Focus on completing projects end-to-end
✅ Show your problem-solving process
✅ Keep code clean and readable

### Don't:

❌ Leave projects half-finished
❌ Skip documentation "for later"
❌ Commit secrets or API keys
❌ Over-engineer simple projects
❌ Copy code without understanding it

## Getting Unstuck

If you're stuck on a project:

1. **Document the blocker** in the GitHub issue
2. **Research** - Google, Stack Overflow, documentation
3. **Simplify** - can you solve a smaller version first?
4. **Ask for help** - communities, forums, mentors
5. **Know when to pivot** - some projects aren't worth finishing

## Questions?

Review the [SETUP_GUIDE.md](./SETUP_GUIDE.md) for more detailed information.

---

**Remember:** This portfolio is about demonstrating your ability to:

- Understand technical concepts
- Make product decisions
- Execute and ship
- Communicate clearly

Quality over quantity. Build things you're proud to show!
