import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import Navbar from "../../components/common/Navbar";
import Footer from "../../components/common/Footer";
import FeaturesSection from "./Features";
import AboutSection from "./About";
import LearnMoreSection from "./LearnMore";

const HEADING_TEXT = "QuickCheck Hub";

/* =========================================================
   MAIN PAGE — imports Navbar, Footer, and all sections,
   one scrollable page, nav links scroll smoothly (portfolio style)
========================================================= */

export default function LandingPage() {
  return (
    <div className="bg-[var(--bg)] text-[var(--text-primary)] font-sans">
      <GlobalStyles />
      <Navbar />

      <section id="home">
        <HomeSection />
      </section>

      <section id="features">
        <FeaturesSection />
      </section>

      <section id="about">
        <AboutSection />
      </section>

      <section id="learn-more">
        <LearnMoreSection />
      </section>

      <Footer />
    </div>
  );
}

/* ---------- shared keyframes ---------- */

function GlobalStyles() {
  return (
    <style>{`
      html { scroll-behavior: smooth; }

      @keyframes fadeInUp {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .animate-fadeInUp { animation: fadeInUp 0.7s ease-out both; }

      @keyframes logoSlide {
        0%, 100% { transform: translateX(0px); }
        50% { transform: translateX(14px); }
      }
      .animate-logoSlide { animation: logoSlide 4s ease-in-out infinite; }

      @keyframes arcSpin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      .animate-arcSpin { animation: arcSpin 6s linear infinite; }

      @keyframes plusPulse {
        0%, 100% { opacity: 0.25; transform: scale(0.8); }
        50% { opacity: 1; transform: scale(1.15); }
      }
      .animate-plusPulse { animation: plusPulse 2.4s ease-in-out infinite; }

      @keyframes blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0; }
      }
      .animate-blink { animation: blink 0.8s step-start infinite; }

      @keyframes glowPulse {
        0%, 100% { opacity: 0.55; }
        50% { opacity: 1; }
      }
      .animate-glowPulse { animation: glowPulse 3s ease-in-out infinite; }
    `}</style>
  );
}

/* =========================================================
   HOME / LANDING SECTION
========================================================= */

function HomeSection() {
  const navigate = useNavigate();

  const handleLogin = () => {
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex items-center relative overflow-hidden">
      <main className="max-w-6xl mx-auto px-6 md:px-10 w-full py-16">
        <div className="flex flex-col md:flex-row items-center justify-between gap-16 md:gap-24 w-full">

          {/* TEXT + BUTTON — LEFT SIDE, pulled further left, away from circle */}
          <div className="flex flex-col gap-3 text-left max-w-md order-2 md:order-1 md:-translate-x-4">
            <TypewriterHeading text={HEADING_TEXT} />

            <p
              className="text-[var(--text-secondary)] text-sm md:text-base leading-6 animate-fadeInUp text-justify"
              style={{ animationDelay: "200ms" }}
            >
              QuickCheck Hub provides AI-powered evaluation for programming
              and text-based assignments using Gemini AI. It offers
              role-based access for Students, Teachers, and Admins. Students
              can submit assignments and receive feedback after teachers
              publish results. Teachers can run peer similarity checks on
              submissions from the same assignment and review analytics.
            </p>

            <div className="animate-fadeInUp" style={{ animationDelay: "300ms" }}>
              <button
                type="button"
                onClick={handleLogin}
                className="inline-flex items-center gap-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold px-6 py-3 rounded-xl transition-all duration-300 hover:scale-105 hover:shadow-[0_0_35px_rgba(56,189,248,0.55)] shadow-[0_0_25px_rgba(56,189,248,0.4)] cursor-pointer"
                aria-label="Login"
              >
                Login
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* CIRCULAR LOGO BADGE — RIGHT SIDE */}
          <div className="animate-logoSlide relative shrink-0 order-1 md:order-2">
            <CircleLogoBadge />
          </div>
        </div>
      </main>
    </div>
  );
}

function TypewriterHeading({ text }) {
  const [displayed, setDisplayed] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    let timeout;

    if (!isDeleting && displayed.length < text.length) {
      timeout = setTimeout(() => {
        setDisplayed(text.slice(0, displayed.length + 1));
      }, 100);
    } else if (!isDeleting && displayed.length === text.length) {
      timeout = setTimeout(() => setIsDeleting(true), 1800);
    } else if (isDeleting && displayed.length > 0) {
      timeout = setTimeout(() => {
        setDisplayed(text.slice(0, displayed.length - 1));
      }, 50);
    } else if (isDeleting && displayed.length === 0) {
      timeout = setTimeout(() => setIsDeleting(false), 400);
    }

    return () => clearTimeout(timeout);
  }, [displayed, isDeleting, text]);

  const splitIndex = Math.min(displayed.length, 10); // "QuickCheck" = 10 chars

  return (
    <h1 className="text-4xl md:text-5xl font-black tracking-tight text-[var(--text-primary)] leading-[1.1] h-[1.1em] flex items-center">
      <span>
        {displayed.slice(0, splitIndex)}
        <span className="text-sky-400">{displayed.slice(splitIndex)}</span>
        <span className="inline-block w-[3px] h-9 md:h-11 bg-sky-400 align-middle ml-1 animate-blink" />
      </span>
    </h1>
  );
}

function CircleLogoBadge() {
  return (
    <div className="relative w-[230px] h-[230px] md:w-[260px] md:h-[260px]">

      {/* soft ambient glow behind everything */}
      <div
        className="absolute -inset-6 rounded-full blur-2xl animate-glowPulse pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(56,189,248,0.45) 0%, transparent 70%)" }}
      />

      {/* rotating conic-gradient arc */}
      <div
        className="absolute -inset-3 rounded-full animate-arcSpin"
        style={{
          background:
            "conic-gradient(from 0deg, transparent 0%, transparent 78%, #38bdf8 92%, transparent 100%)",
          WebkitMask:
            "radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px))",
          mask:
            "radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px))",
        }}
      />

      {/* static ring behind the image, with glowing edge */}
      <svg
        viewBox="0 0 280 280"
        className="absolute inset-0 w-full h-full"
        style={{ filter: "drop-shadow(0 0 22px rgba(56,189,248,0.65)) drop-shadow(0 0 45px rgba(14,165,233,0.35))" }}
      >
        <defs>
          <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#7dd3fc" />
            <stop offset="45%" stopColor="#0ea5e9" />
            <stop offset="100%" stopColor="#0369a1" />
          </linearGradient>
        </defs>
        <circle cx="140" cy="140" r="120" fill="var(--bg)" stroke="url(#ringGradient)" strokeWidth="12" />
      </svg>

      {/* logo image, clipped into the circle */}
      <div className="absolute inset-[12px] rounded-full overflow-hidden flex items-center justify-center bg-[var(--bg)] shadow-[inset_0_0_25px_rgba(56,189,248,0.35)]">
        <img
          src="/logo.png"
          alt="QuickCheck Hub Logo"
          className="w-full h-full object-cover"
        />
      </div>

      {/* plus signs around the badge */}
      {[
        { top: "-8%", left: "-8%", delay: 0 },
        { top: "-8%", right: "-8%", delay: 0.4 },
        { bottom: "-8%", left: "-8%", delay: 0.8 },
        { bottom: "-8%", right: "-8%", delay: 1.2 },
      ].map((pos, i) => (
        <span
          key={i}
          className="absolute text-sky-400 text-xl md:text-2xl font-light select-none animate-plusPulse"
          style={{
            top: pos.top,
            left: pos.left,
            right: pos.right,
            bottom: pos.bottom,
            animationDelay: `${pos.delay}s`,
          }}
        >
          +
        </span>
      ))}
    </div>
  );
}