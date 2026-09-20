import { supporterDisplay, type SupporterIdentity as Identity } from "@/lib/supporter-identity";

export function SupporterIdentity({
  identity,
  manage = false,
}: {
  identity: Identity;
  manage?: boolean;
}) {
  const display = supporterDisplay(identity);
  return (
    <div className="min-w-0 break-words text-sm">
      <p className="font-semibold text-swag-navy">
        {display.name}
        {identity.supporter_year_group ? ` · ${identity.supporter_year_group}` : ""}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{display.subtitle}</p>
      {display.incomplete && (
        <p className="mt-1 text-xs text-swag-orange">
          Profile incomplete · Missing {display.missing}
        </p>
      )}
      {identity.supporter_id && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Account · {identity.supporter_id.slice(0, 8)}
        </p>
      )}
      {manage && display.incomplete && (
        <a
          href="/teacher/team"
          className="mt-1 inline-block text-xs font-semibold text-swag-blue underline"
        >
          Update support team profile
        </a>
      )}
    </div>
  );
}
