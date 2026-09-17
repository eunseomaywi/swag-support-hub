import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { publicNavigation } from "@/content/public-copy";
import { cn } from "@/lib/utils";

const linkClass =
  "rounded-md px-1 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-swag-navy data-[status=active]:text-swag-navy data-[status=active]:font-semibold data-[status=active]:border-b-2 data-[status=active]:border-swag-blue";

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3 sm:px-6">
        <Link to="/" className="flex min-w-0 items-center" aria-label="SWAG home">
          <img
            src="/swag_logo.png"
            alt="SWAG logo"
            width={500}
            height={499}
            loading="eager"
            decoding="sync"
            className="h-10 w-auto shrink-0 object-contain"
            style={{ width: "auto", height: "40px", aspectRatio: "500 / 499" }}
          />
        </Link>

        <nav className="hidden items-center gap-6 md:flex" aria-label="Main">
          {publicNavigation.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: "exact" in item ? item.exact : false }}
              className={cn(
                linkClass,
                "action" in item && item.action
                  ? "border border-swag-blue/30 px-3 py-2 font-semibold text-swag-navy hover:border-swag-blue data-[status=active]:border-swag-blue data-[status=active]:bg-swag-blue/5"
                  : "",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border text-swag-navy md:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <nav
          id="mobile-nav"
          aria-label="Main mobile"
          className="border-t border-border bg-background px-4 py-2 md:hidden"
        >
          {publicNavigation.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: "exact" in item ? item.exact : false }}
              onClick={() => setOpen(false)}
              className="block border-b border-border/60 py-3 text-sm font-medium text-muted-foreground last:border-0 data-[status=active]:font-semibold data-[status=active]:text-swag-navy"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
