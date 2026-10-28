import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { LANDING_DEFAULTS, type CtaContent } from "@/lib/landing-defaults";

const DEFAULTS = LANDING_DEFAULTS.cta;

function withDefaults(content?: Partial<CtaContent> | null): CtaContent {
  return {
    title_line_1: content?.title_line_1?.trim() || DEFAULTS.title_line_1,
    title_line_2: content?.title_line_2?.trim() || DEFAULTS.title_line_2,
    subhead: content?.subhead?.trim() || DEFAULTS.subhead,
    cta_label: content?.cta_label?.trim() || DEFAULTS.cta_label,
  };
}

export function LandingCta({
  content,
  titleWeight = 700,
  onCtaClick,
}: {
  content?: Partial<CtaContent> | null;
  titleWeight?: number;
  onCtaClick?: () => void;
}) {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const copy = withDefaults(content);

  const handleClick = () => {
    if (onCtaClick) {
      onCtaClick();
      return;
    }
    signIn();
    navigate("/dashboard");
  };

  return (
    <section
      className="relative min-h-[776px] bg-background py-8 text-foreground sm:py-16"
      style={{ backgroundImage: "radial-gradient(ellipse at 100% 20%, hsl(var(--primary) / 0.09), transparent 60%)" }}
    >
      <div className="mx-auto max-w-4xl px-6 sm:px-8">
        <div className="relative flex min-h-[648px] items-center border-t border-border pb-10 pt-[136px] sm:pb-16 sm:pt-40">
          <div className="pointer-events-none absolute inset-x-0 top-8 flex justify-center" aria-hidden="true">
              <svg width="72" height="88" viewBox="0 0 130 158" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="10" y="28" width="110" height="120" rx="16" fill="hsl(var(--card))" />
                <rect x="10" y="28" width="110" height="32" rx="16" fill="hsl(var(--primary))" />
                <rect x="10" y="44" width="110" height="16" fill="hsl(var(--primary))" />
                <rect x="38" y="14" width="10" height="28" rx="5" fill="hsl(var(--foreground))" />
                <rect x="82" y="14" width="10" height="28" rx="5" fill="hsl(var(--foreground))" />
                {[0, 1, 2, 3, 4].map((col) =>
                  [0, 1, 2, 3].map((row) => (
                    <rect
                      key={`${col}-${row}`}
                      x={21 + col * 19}
                      y={72 + row * 18}
                      width="12"
                      height="10"
                      rx="2.5"
                      fill={col === 3 && row === 2 ? "hsl(var(--primary))" : "hsl(var(--border))"}
                    />
                  )),
                )}
                <path d="M75 100L78 103L84 96" stroke="hsl(var(--primary-foreground))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
          </div>
          <div className="w-full text-center">
            <h2
              className="mx-auto mb-6 max-w-[490px] text-balance font-display text-[44px] leading-none tracking-[-0.04em] text-foreground sm:text-[60px]"
              style={{ fontWeight: titleWeight }}
            >
              {copy.title_line_1}
              <br />
              {copy.title_line_2}
            </h2>
            <p className="mx-auto mb-8 max-w-[400px] text-balance text-[17px] leading-relaxed text-muted-foreground sm:text-lg">
              {copy.subhead}
            </p>
            <Button
              size="lg"
              className="h-auto min-h-14 max-w-full whitespace-normal rounded-xl bg-primary px-7 py-3 text-lg font-semibold text-primary-foreground shadow-[0_8px_0_hsl(var(--primary)/0.12)] hover:bg-primary/90"
              onClick={handleClick}
            >
              {copy.cta_label}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
