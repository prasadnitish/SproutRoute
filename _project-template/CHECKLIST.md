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
