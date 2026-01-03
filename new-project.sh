#!/bin/bash

# Project Starter Script
# This script helps you start a new portfolio project with all the right templates

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${BLUE}   TPM Portfolio - New Project Setup${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo ""

# Get project name
read -p "Enter project name (lowercase-with-dashes): " PROJECT_NAME

if [ -z "$PROJECT_NAME" ]; then
    echo -e "${YELLOW}Error: Project name cannot be empty${NC}"
    exit 1
fi

if [ -d "$PROJECT_NAME" ]; then
    echo -e "${YELLOW}Error: Directory $PROJECT_NAME already exists${NC}"
    exit 1
fi

# Copy template
echo -e "${GREEN}✓${NC} Creating project from template..."
cp -r _project-template "$PROJECT_NAME"

# Update project name in README
echo -e "${GREEN}✓${NC} Updating project name in README..."
sed -i.bak "s/\[Project Name\]/$PROJECT_NAME/g" "$PROJECT_NAME/README.md"
rm "$PROJECT_NAME/README.md.bak" 2>/dev/null || true

echo ""
echo -e "${GREEN}✓ Project created successfully!${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo ""
echo -e "  1. ${YELLOW}cd $PROJECT_NAME${NC}"
echo -e "  2. Open ${YELLOW}docs/PRD.md${NC} and plan your project"
echo -e "  3. Open ${YELLOW}docs/ARCHITECTURE.md${NC} and design your system"
echo -e "  4. Create a GitHub issue using the 'New Project' template"
echo -e "  5. Start coding in ${YELLOW}src/${NC}"
echo ""
echo -e "${BLUE}Remember:${NC}"
echo -e "  • Follow guidelines in ${YELLOW}.claude-instructions.md${NC}"
echo -e "  • Use ${YELLOW}CHECKLIST.md${NC} to track progress"
echo -e "  • Commit frequently with clear messages"
echo ""
echo -e "${GREEN}Happy coding! 🚀${NC}"
