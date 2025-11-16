# Git Setup Guide

This guide will help you initialize Git, commit your code, and push it to GitHub for seamless collaboration with Copilot.

## 📋 Prerequisites

- Git installed on your system ([Download Git](https://git-scm.com/downloads))
- GitHub account ([Sign up](https://github.com/signup))
- GitHub repository created (optional - can be created later)

## 🚀 Quick Setup

### Option A: New GitHub Repository

If you haven't created a GitHub repository yet:

1. **Go to GitHub** and create a new repository:
   - Visit [github.com/new](https://github.com/new)
   - Choose a repository name (e.g., `ai-chatbot-platform`)
   - Select visibility (Public or Private)
   - **DO NOT** initialize with README, .gitignore, or license (your project already has these)
   - Click "Create repository"

2. **Initialize Git locally** (in your project directory):

```bash
# Initialize Git repository
git init

# Add all files to staging
git add .

# Create first commit
git commit -m "Initial commit: AI Chatbot Platform with analytics dashboard"

# Add GitHub remote (replace with your repository URL)
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git

# Push to GitHub
git branch -M main
git push -u origin main
```

### Option B: Existing GitHub Repository

If you already have a GitHub repository:

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git

# Copy your project files into the cloned directory
# Then commit and push

git add .
git commit -m "Initial commit: AI Chatbot Platform with analytics dashboard"
git push origin main
```

## 🔄 Regular Workflow

After the initial setup, use these commands for regular updates:

```bash
# Check status of your files
git status

# Add specific files
git add src/components/chatbot/ChatbotWidget.tsx

# Or add all changes
git add .

# Commit with a descriptive message
git commit -m "feat: Add multilingual support to chatbot"

# Push to GitHub
git push origin main
```

## 📝 Commit Message Conventions

Use clear, descriptive commit messages:

```bash
# Features
git commit -m "feat: Add export transcript functionality"

# Bug fixes
git commit -m "fix: Resolve ReactMarkdown className error"

# Documentation
git commit -m "docs: Update README with setup instructions"

# Refactoring
git commit -m "refactor: Split ChatbotWidget into smaller components"

# Styling
git commit -m "style: Update dark mode colors"

# Tests
git commit -m "test: Add unit tests for ChatbotWidget"

# Performance
git commit -m "perf: Optimize message rendering with React.memo"

# Configuration
git commit -m "chore: Update dependencies"
```

## 🌿 Branch Strategy (Optional)

For collaborative development:

```bash
# Create a new feature branch
git checkout -b feature/new-chatbot-feature

# Make your changes, then commit
git add .
git commit -m "feat: Add voice input support"

# Push the branch to GitHub
git push origin feature/new-chatbot-feature

# Create a Pull Request on GitHub
# After review and merge, switch back to main
git checkout main
git pull origin main
```

## 🔍 Useful Git Commands

```bash
# View commit history
git log --oneline

# View changes before committing
git diff

# Undo uncommitted changes to a file
git checkout -- filename.tsx

# Undo last commit (keep changes)
git reset --soft HEAD~1

# Undo last commit (discard changes) - USE WITH CAUTION
git reset --hard HEAD~1

# Create a new branch
git branch feature-name

# Switch branches
git checkout branch-name

# Delete a branch
git branch -d branch-name

# Pull latest changes from GitHub
git pull origin main

# Check remote URL
git remote -v

# Change remote URL
git remote set-url origin https://github.com/NEW_USERNAME/NEW_REPO.git
```

## 🔐 Authentication

### SSH (Recommended)

1. **Generate SSH key** (if you don't have one):
```bash
ssh-keygen -t ed25519 -C "your_email@example.com"
```

2. **Add SSH key to GitHub**:
   - Copy your public key: `cat ~/.ssh/id_ed25519.pub`
   - Go to [GitHub SSH Settings](https://github.com/settings/keys)
   - Click "New SSH Key"
   - Paste your key and save

3. **Update remote to use SSH**:
```bash
git remote set-url origin git@github.com:YOUR_USERNAME/YOUR_REPO_NAME.git
```

### HTTPS with Personal Access Token

1. **Create a token**:
   - Go to [GitHub Token Settings](https://github.com/settings/tokens)
   - Click "Generate new token (classic)"
   - Select scopes: `repo` (full control)
   - Generate and copy the token

2. **Use token when prompted for password** during `git push`

## 🔄 Syncing with Copilot

When handing off to Copilot:

1. **Ensure all changes are committed and pushed**:
```bash
git add .
git commit -m "docs: Add comprehensive documentation for Copilot handoff"
git push origin main
```

2. **Verify on GitHub**:
   - Visit your repository on GitHub
   - Check that all files are up to date
   - Verify `REQUIREMENTS.md` and `README.md` are visible

3. **Share repository URL** with Copilot or team members

## 📊 Project Status Check

Before handing off, verify your repository includes:

- [x] Source code (`src/` directory)
- [x] Configuration files (`package.json`, `tsconfig.json`, `next.config.ts`)
- [x] Documentation (`README.md`, `REQUIREMENTS.md`)
- [x] Git files (`.gitignore`)
- [x] Dependencies lock file (`package-lock.json` or `bun.lock`)

## 🛠️ Troubleshooting

### "Repository not found" error
```bash
# Check your remote URL
git remote -v

# Update remote URL if incorrect
git remote set-url origin https://github.com/CORRECT_USERNAME/CORRECT_REPO.git
```

### "Permission denied" error
- Check your GitHub authentication (SSH key or token)
- Ensure you have write access to the repository

### "Divergent branches" error
```bash
# If you want to keep remote changes
git pull origin main --rebase

# If you want to keep local changes
git push origin main --force  # USE WITH CAUTION
```

### Large files error
```bash
# If you accidentally added large files
git rm --cached path/to/large/file
echo "path/to/large/file" >> .gitignore
git commit -m "Remove large file from tracking"
```

## 📚 Learn More

- [Git Documentation](https://git-scm.com/doc)
- [GitHub Guides](https://guides.github.com/)
- [Atlassian Git Tutorials](https://www.atlassian.com/git/tutorials)
- [Git Cheat Sheet](https://education.github.com/git-cheat-sheet-education.pdf)

## 🎯 Quick Reference

```bash
# Essential commands for daily use
git status              # Check what's changed
git add .               # Stage all changes
git commit -m "msg"     # Commit with message
git push origin main    # Push to GitHub
git pull origin main    # Pull latest changes
git log --oneline       # View commit history
```

## ✅ Verification Checklist

Before considering your Git setup complete:

- [ ] Git initialized (`git status` works)
- [ ] Remote added (`git remote -v` shows GitHub URL)
- [ ] Initial commit created
- [ ] Code pushed to GitHub
- [ ] Repository visible on GitHub.com
- [ ] `.gitignore` properly configured
- [ ] `README.md` and `REQUIREMENTS.md` visible on GitHub
- [ ] All dependencies documented in `package.json`

---

**Ready to collaborate!** Your code is now version-controlled and ready for Copilot or team collaboration. 🎉
