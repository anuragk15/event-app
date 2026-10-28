import { useState } from "react";
import { Link } from "react-router-dom";
import { usePublicEventsByUser, usePublicRegistrationCounts } from "@/hooks/usePublicCompany";
import { useProfile } from "@/hooks/useProfile";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, MapPin, Users, Globe, ExternalLink, Mail, ArrowRight, LayoutGrid, List } from "lucide-react";
import { format } from "date-fns";
import { StaggerGroup, StaggerItem } from "@/components/motion/Reveal";

const SOCIAL_ICONS: Record<string, string> = {
  "Twitter / X": "https://cdn.simpleicons.org/x/ffffff",
  "LinkedIn": "https://cdn.simpleicons.org/linkedin/ffffff",
  "Instagram": "https://cdn.simpleicons.org/instagram/ffffff",
  "Facebook": "https://cdn.simpleicons.org/facebook/ffffff",
  "YouTube": "https://cdn.simpleicons.org/youtube/ffffff",
  "TikTok": "https://cdn.simpleicons.org/tiktok/ffffff",
  "GitHub": "https://cdn.simpleicons.org/github/ffffff",
};

type SocialLink = { platform: string; url: string };

const CompanyPage = () => {
  const { data: company, isLoading } = useProfile();
  const { data: events } = usePublicEventsByUser(company?.id);
  const eventIds = events?.map((e) => e.id) ?? [];
  const { data: regCounts } = usePublicRegistrationCounts(eventIds);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  if (isLoading) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-[300px] w-full rounded-2xl" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-52 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center space-y-4">
          <h1 className="text-3xl font-bold text-foreground">No company profile yet</h1>
          <p className="text-muted-foreground">Add your company details to populate this page.</p>
          <Link to="/dashboard/settings"><Button variant="outline" className="rounded-full">Go to settings</Button></Link>
        </div>
      </div>
    );
  }

  const socialLinks: SocialLink[] = Array.isArray(company.social_links) ? (company.social_links as any[]) : [];

  const sortedEvents = [...(events || [])].sort(
    (a, b) => new Date(a.event_date || 0).getTime() - new Date(b.event_date || 0).getTime()
  );
  const now = new Date();
  const upcomingEvents = sortedEvents.filter(e => e.event_date && new Date(e.event_date) >= now);
  const pastEvents = sortedEvents.filter(e => !e.event_date || new Date(e.event_date) < now);

  return (
    <div>
      {/* ========== HERO ========== */}
      <section className="relative">
        <div className="relative min-h-[320px] sm:h-[380px] overflow-hidden rounded-2xl bg-gradient-to-br from-[hsl(var(--primary)/0.4)] via-[hsl(var(--primary)/0.15)] to-background">
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />

          <div className="relative flex items-end h-full px-6 pb-10 pt-8 sm:absolute sm:bottom-0 sm:left-0 sm:right-0 sm:pt-0">
          <div className="w-full">
            <div className="flex items-center gap-4 mb-4">
              {company.avatar_url && (
                <img
                  src={company.avatar_url}
                  alt={company.company || "Company"}
                  className="w-16 h-16 rounded-xl object-cover border-2 border-border/50 shadow-lg"
                />
              )}
              <h1 className="text-2xl sm:text-4xl md:text-5xl font-display font-bold text-foreground drop-shadow-lg">
                {company.company || company.full_name || "Unnamed Company"}
              </h1>
            </div>

            {company.company_description && (
              <p className="text-white text-lg max-w-full mb-6 leading-relaxed">
                {company.company_description}
              </p>
            )}

            {/* Social Icons Row */}
            <div className="flex items-center gap-3">
              {company.website && (
                <a href={company.website} target="_blank" rel="noopener noreferrer"
                  className="w-10 h-10 rounded-full bg-foreground/10 backdrop-blur-sm border border-border/30 flex items-center justify-center hover:bg-foreground/20 transition-colors"
                  title="Website">
                  <Globe className="w-5 h-5 text-foreground" />
                </a>
              )}
              {socialLinks.filter((s) => s.platform && s.url).map((s, i) => (
                <a key={i} href={s.platform === "Email" ? `mailto:${s.url}` : s.url} target="_blank" rel="noopener noreferrer"
                  className="w-10 h-10 rounded-full bg-foreground/10 backdrop-blur-sm border border-border/30 flex items-center justify-center hover:bg-foreground/20 transition-colors"
                  title={s.platform}>
                  {s.platform === "Email" ? (
                    <Mail className="w-5 h-5 text-foreground" />
                  ) : SOCIAL_ICONS[s.platform] ? (
                    <img src={SOCIAL_ICONS[s.platform]} alt={s.platform} className="w-5 h-5" />
                  ) : (
                    <ExternalLink className="w-5 h-5 text-foreground" />
                  )}
                </a>
              ))}
            </div>
          </div>
          </div>
        </div>
      </section>

      {/* ========== UPCOMING EVENTS ========== */}
      {upcomingEvents.length > 0 && (
        <section className="mt-10">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-2xl font-display font-bold text-foreground">Upcoming Events</h2>
            <div className="flex border border-border rounded-md overflow-hidden">
              <button onClick={() => setViewMode("list")}
                className={`p-2.5 transition-colors ${viewMode === "list" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"}`}>
                <List className="w-4 h-4" />
              </button>
              <button onClick={() => setViewMode("grid")}
                className={`p-2.5 transition-colors ${viewMode === "grid" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"}`}>
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
          </div>
          {viewMode === "grid" ? (
            <StaggerGroup className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {upcomingEvents.map((event) => (
                <StaggerItem key={event.id}>
                  <EventCard event={event} regCount={regCounts?.[event.id]} />
                </StaggerItem>
              ))}
            </StaggerGroup>
          ) : (
            <StaggerGroup className="space-y-4">
              {upcomingEvents.map((event) => (
                <StaggerItem key={event.id}>
                  <EventListItem event={event} regCount={regCounts?.[event.id]} />
                </StaggerItem>
              ))}
            </StaggerGroup>
          )}
        </section>
      )}

      {/* ========== PAST EVENTS ========== */}
      {pastEvents.length > 0 && (
        <section className="mt-12 pb-4">
          <h2 className="text-2xl font-display font-bold text-foreground mb-5">Past Events</h2>
          {viewMode === "grid" ? (
            <StaggerGroup className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {pastEvents.map((event) => (
                <StaggerItem key={event.id}>
                  <EventCard event={event} regCount={regCounts?.[event.id]} />
                </StaggerItem>
              ))}
            </StaggerGroup>
          ) : (
            <StaggerGroup className="space-y-4">
              {pastEvents.map((event) => (
                <StaggerItem key={event.id}>
                  <EventListItem event={event} regCount={regCounts?.[event.id]} />
                </StaggerItem>
              ))}
            </StaggerGroup>
          )}
        </section>
      )}

      {(!events || events.length === 0) && (
        <div className="py-20 text-center">
          <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">No events yet</h3>
          <p className="text-muted-foreground">Check back soon for upcoming events.</p>
        </div>
      )}
    </div>
  );
};

/* ========== GRID CARD ========== */
function EventCard({ event, regCount }: { event: any; regCount?: number }) {
  return (
    <Link to={`/register/${event.slug}`}>
      <Card className="overflow-hidden group hover:shadow-xl transition-all hover:-translate-y-1 border-border/50 h-full">
        <div className="h-44 overflow-hidden relative">
          {event.background_image_url ? (
            <img src={event.background_image_url} alt={event.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
          ) : (
            <div className="w-full h-full bg-muted flex items-center justify-center">
              <Calendar className="w-10 h-10 text-muted-foreground/40" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        </div>
        <CardContent className="p-5 space-y-3">
          {event.event_date && (
            <p className="text-xs font-semibold text-primary uppercase tracking-wide">
              {format(new Date(event.event_date), "EEE, MMM d · h:mm a")}
            </p>
          )}
          <h3 className="font-display font-bold text-lg text-foreground leading-tight line-clamp-2">{event.name}</h3>
          {event.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">{event.description.replace(/[*#_~`>]/g, "").slice(0, 120)}</p>
          )}
          <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
            {event.location_value && (
              <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /><span className="truncate max-w-[140px]">{event.location_value}</span></span>
            )}
            {regCount !== undefined && (
              <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" />{regCount}</span>
            )}
          </div>
          <Button className="w-full mt-1 bg-primary" size="sm">Register <ArrowRight className="ml-1 w-3.5 h-3.5" /></Button>
        </CardContent>
      </Card>
    </Link>
  );
}

/* ========== LIST ITEM ========== */
function EventListItem({ event, regCount }: { event: any; regCount?: number }) {
  const shortDesc = event.description
    ? event.description.replace(/[*#_~`>]/g, "").split(/(?<=\.)\s+/).filter(Boolean).slice(0, 2).join(" ").slice(0, 200)
    : "";

  const date = event.event_date ? new Date(event.event_date) : null;

  return (
    <Link
      to={`/register/${event.slug}`}
      className="group block rounded-[20px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <article className="relative isolate grid min-h-[320px] grid-cols-1 content-end items-end gap-5 overflow-hidden rounded-[20px] bg-[hsl(240_25%_9%)] p-[18px] text-white sm:min-h-[188px] sm:grid-cols-[minmax(0,1fr)_auto] sm:px-[26px] sm:py-[22px]">
        {event.background_image_url ? (
          <img
            src={event.background_image_url}
            alt=""
            className="absolute inset-0 -z-20 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        ) : (
          <div
            aria-hidden
            className="absolute inset-0 -z-20"
            style={{
              background:
                "radial-gradient(circle at 85% 15%, hsl(var(--primary) / 0.6), transparent 50%), radial-gradient(hsl(0 0% 100% / 0.1) 1px, transparent 1px) 0 0 / 14px 14px, hsl(240 25% 11%)",
            }}
          />
        )}
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-gradient-to-t from-[hsl(240_30%_6%/0.95)] via-[hsl(240_30%_6%/0.8)] to-[hsl(240_30%_6%/0.1)] sm:bg-gradient-to-r sm:from-[hsl(240_30%_6%/0.94)] sm:via-[hsl(240_30%_6%/0.78)] sm:to-[hsl(240_30%_6%/0.15)]"
        />

        <div className="flex min-w-0 max-w-[560px] flex-col gap-2.5">
          {date && (
            <span className="inline-flex items-center gap-2 self-start whitespace-nowrap rounded-full bg-white px-3 py-1.5 text-[13px] font-semibold text-[hsl(240_30%_14%)]">
              {format(date, "EEE d MMM")}
              <span className="text-primary">{format(date, "h:mm a")}</span>
            </span>
          )}
          <h3 className="line-clamp-2 font-display text-[21px] font-bold leading-[1.12] tracking-[-0.01em] text-white [text-wrap:balance] sm:text-[25px]">
            {event.name}
          </h3>
          {shortDesc && <p className="line-clamp-1 text-sm text-white/80">{shortDesc}</p>}
          <div className="flex min-w-0 flex-wrap gap-x-[18px] gap-y-1.5 text-[13px] text-white/90">
            {event.location_value && (
              <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
                <MapPin className="h-[15px] w-[15px] shrink-0 text-white/65" />
                <span className="truncate font-medium">{event.location_value}</span>
              </span>
            )}
            {regCount !== undefined && (
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-[15px] w-[15px] shrink-0 text-white/65" />
                <span className="font-medium">{regCount.toLocaleString()} going</span>
              </span>
            )}
          </div>
        </div>

        <Button className="w-full bg-primary px-6 text-primary-foreground hover:bg-primary/90 sm:w-auto">Register</Button>
      </article>
    </Link>
  );
}

export default CompanyPage;
