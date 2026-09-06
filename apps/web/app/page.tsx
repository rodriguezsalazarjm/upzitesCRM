import { TopNav, Hero, Marquee, Services, ExpressSolutions, Projects, Process, Stats, Testimonials, BigCTA, Footer } from "@/components/Sections";
import { ScheduleMeeting } from "@/components/ExtraSections";
import { QuienesSomos } from "@/components/QuienesSomos";
import { TechMarquee } from "@/components/TechMarquee";
import { SmartLayer } from "@/components/SmartLayer";
import { ViewContentOnLoad } from "@/components/MetaPixelEvents";
import { OurWorkScene } from "@/components/OurWorkScene";

export default function Home() {
  return (
    <div id="top">
      <ViewContentOnLoad contentName="Home" contentCategory="landing" contentId="page:home" />
      <TopNav />

      {/* Above-the-fold */}
      <Hero />

      {/* Trust bar */}
      <Stats />

      {/* Manifesto marquee */}
      <Marquee />

      {/* Services */}
      <Services />

      {/* Express solutions */}
      <ExpressSolutions />

      {/* Smart layer — AI & automation as a premium extension */}
      <SmartLayer />

      {/* Tech / tooling stack marquee */}
      <TechMarquee />

      {/* About the studio + founder */}
      <QuienesSomos />

      {/* Portfolio — escena cinematográfica "OUR WORK" (scroll-driven) */}
      <OurWorkScene />

      {/* Portfolio — galería navegable (filtros + marquesina) */}
      <Projects />

      {/* Schedule a meeting */}
      <ScheduleMeeting />

      {/* Detailed process */}
      <Process />

      {/* Manifesto-style marquee */}
      <Marquee
        variant="carbon"
        items={[
          "Tu marca · con dirección",
          "Diseño con sangre",
          "Branding tropical underground",
          "Web que vende",
          "Menos genérico · más marca",
        ]}
      />

      {/* Social proof */}
      <Testimonials />

      {/* Big CTA + contact form (with brief buttons) */}
      <BigCTA />

      <Footer />
    </div>
  );
}
