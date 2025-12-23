// Simple CLI UI helpers
export namespace UI {
  export function error(message: string) {
    console.error(`\x1b[31m✖\x1b[0m ${message}`);
  }

  export function success(message: string) {
    console.log(`\x1b[32m✔\x1b[0m ${message}`);
  }

  export function info(message: string) {
    console.log(`\x1b[34mℹ\x1b[0m ${message}`);
  }

  export function warn(message: string) {
    console.warn(`\x1b[33m⚠\x1b[0m ${message}`);
  }

  export function logo(): string {
    return `
\x1b[36m╔═══════════════════════════════╗
║       AWS Session Manager     ║
║          (awsesh)             ║
╚═══════════════════════════════╝\x1b[0m
`;
  }
}
