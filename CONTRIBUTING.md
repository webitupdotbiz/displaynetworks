# Contributing to Display Networks

Thank you for your interest in contributing to Display Networks.

## Code of Conduct

This project adheres to the Contributor Covenant Code of Conduct. By participating, you are expected to uphold this code.

## Development Setup

1. Fork and clone the repository:
   ```bash
   git clone git@github.com:webitupdotbiz/displaynetworks.git
   cd displaynetworks
   ```
2. Ensure you are using the node version specified in `.nvmrc`:
   ```bash
   nvm use
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the local development environment:
   ```bash
   npm run dev
   ```

## Development Standards

* **TypeScript Usage:** Write strongly typed TypeScript. Avoid `any` types and match existing application patterns.
* **Code Formatting:** Keep code clean, readable, and properly formatted without unnecessary noise or numbering in comments.
* **Testing:** Ensure all tests pass before submitting a Pull Request:
  ```bash
  npm test
  npm run test:server
  ```

## Pull Request Process

1. Create a feature branch off `main` (`git checkout -b feature/your-feature-name`).
2. Commit your changes with clear, descriptive commit messages.
3. Push to your fork and submit a Pull Request targeting `main`.
4. Ensure PRs are targeted, clean, concise, and pass all continuous integration checks.
