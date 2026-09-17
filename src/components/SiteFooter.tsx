import { Link } from "@tanstack/react-router";

export function SiteFooter() {
  return (
    <footer className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 pb-8 pt-12 sm:px-6">
      <Link
        to="/login"
        className="text-xs font-medium text-swag-navy/70 underline-offset-4 hover:text-swag-navy hover:underline"
      >
        Staff &amp; Peer Mentor Login
      </Link>
      <p className="text-xs text-swag-navy/60">website by @eunseowi</p>
    </footer>
  );
}
