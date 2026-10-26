export function cx(...classes) {
  return classes
    .filter(Boolean)
    .join(' ')
}

// shadcn's generator imports `cn`; application JSX continues to use `cx`.
export { cx as cn };
