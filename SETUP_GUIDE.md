# Portfolio Setup Guide

This guide explains the tools and templates available in this portfolio repository.

## Repository Structure

```
tpm-portfolio/
├── _project-template/          # Template for new projects
│   ├── docs/                   # Documentation templates
│   │   ├── ARCHITECTURE.md     # Technical architecture
│   │   └── PRD.md             # Product requirements
│   ├── src/                   # Source code directory
│   ├── tests/                 # Test directory
│   ├── README.md              # Project README template
│   ├── requirements.txt       # Python dependencies template
│   └── package.json           # Node.js dependencies template
├── .github/                   # GitHub configuration
│   └── ISSUE_TEMPLATE/        # Issue templates for planning
├── .pre-commit-config.yaml    # Code quality hooks
├── .editorconfig             # Editor settings
└── README.md                 # Portfolio overview
```

## Starting a New Project

### 1. Copy the Template

```bash
# From the repository root
cp -r _project-template your-new-project-name
cd your-new-project-name
```

### 2. Customize the README

Edit `README.md` with your project details:
- Project name and overview
- Problem statement and solution
- Tech stack
- Setup instructions

### 3. Fill Out the PRD

Edit `docs/PRD.md` to plan your project:
- Define user stories
- Set success metrics
- List requirements
- Create timeline

### 4. Start Building

- Add your code to `src/`
- Add tests to `tests/`
- Update documentation as you build

### 5. Track Progress with GitHub Issues

Create a project issue using the "New Project" template:
- Go to [Issues](https://github.com/nitishprasad-bot/tpm-portfolio/issues/new/choose)
- Choose "New Project" template
- Fill in project details
- Use issue checkboxes to track progress

## Code Quality Tools

### Pre-commit Hooks (Optional but Recommended)

Pre-commit hooks automatically check your code before each commit.

**Setup:**

```bash
# Install pre-commit
pip install pre-commit

# Install the hooks
pre-commit install

# Run manually on all files
pre-commit run --all-files
```

**What it checks:**
- Trailing whitespace
- File formatting (Python, JavaScript, JSON, YAML)
- Large files
- Private keys or secrets
- Code style (Black for Python, Prettier for JS)

### EditorConfig

The `.editorconfig` file ensures consistent formatting across different editors.

Most modern editors (VS Code, Sublime, IntelliJ) support this automatically.

## GitHub Features

### Issue Templates

Use these to plan and track work:

- **New Project**: Plan a new portfolio project
- **Bug Report**: Track bugs in existing projects
- **Feature Enhancement**: Add features to existing projects

### Labels (Create these in GitHub)

Suggested labels for your issues:
- `project` - New project planning
- `bug` - Bug fixes
- `enhancement` - New features
- `documentation` - Documentation updates
- `in-progress` - Currently working on
- `completed` - Finished

**To add labels:**
1. Go to your repo's Issues tab
2. Click "Labels"
3. Create the labels above

### GitHub Projects (Optional)

Create a project board to visualize your progress:
1. Go to Projects tab in your repo
2. Create a new project (Board view)
3. Add columns: Backlog, In Progress, Completed
4. Link issues to the board

## Recommended Workflow

### For Each New Project:

1. **Plan** (Week 1)
   - Create GitHub issue using "New Project" template
   - Fill out PRD.md
   - Research and list technical requirements

2. **Design** (Week 1-2)
   - Sketch architecture in ARCHITECTURE.md
   - Design data models
   - Plan API endpoints or user flows

3. **Build MVP** (Week 2-3)
   - Implement core functionality
   - Focus on working prototype
   - Commit frequently with clear messages

4. **Polish** (Week 3-4)
   - Add error handling
   - Write tests
   - Complete documentation
   - Add screenshots/demo

5. **Ship**
   - Update main portfolio README
   - Close the GitHub issue
   - Share on LinkedIn or with recruiters

## Tips for TPM Portfolio

### What Recruiters Look For:

1. **Clear Documentation**
   - Problem statements
   - Solution approaches
   - Technical decisions explained

2. **Product Thinking**
   - User stories
   - Success metrics
   - Prioritization rationale

3. **Technical Depth**
   - Working code
   - System design
   - API understanding

4. **Execution Skills**
   - Completed projects
   - Clean commit history
   - Professional presentation

### Quality Over Quantity

- Better to have 3-5 polished projects than 10 half-finished ones
- Each project should tell a story
- Document your learnings and challenges

### Showcase Different Skills

Vary your projects to show:
- Backend APIs
- Frontend development
- Data analysis
- System integration
- Automation
- Database design

## Getting Help

- Check project documentation in `docs/`
- Review issue templates for guidance
- Look at example projects (to be added)

## Next Steps

Ready to start? Choose one of these projects:
1. API Integration Dashboard
2. Feature Flag System
3. Product Analytics Simulator
4. Workflow Automation Tool
5. Technical Documentation Site

Good luck building your portfolio!
