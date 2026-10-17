import React, { useState } from "react";

export default function AboutSection() {
  const [activeIndex, setActiveIndex] = useState(null);

  return (
    <div className="bg-[var(--bg)] text-[var(--text-primary)] min-h-screen">
      <div className="py-20 px-8 text-center">
        <h2 className="text-4xl text-sky-400 mb-12 font-bold animate-fadeInUp">
          About QuickCheck Hub
        </h2>

        <p
          className="text-[var(--text-muted)] max-w-3xl mx-auto mb-12 text-lg md:text-xl animate-fadeInUp text-justify"
          style={{ animationDelay: "100ms" }}
        >
          QuickCheck Hub is an AI-powered platform for automated assignment evaluation. 
          Our mission is to help instructors efficiently evaluate assignments while providing 
          students with instant, actionable feedback.
        </p>

        {/* ADMIN BOXES */}
        <div className="mb-16">
          <h3
            className="text-2xl text-sky-400 mb-6 font-semibold animate-fadeInUp"
            style={{ animationDelay: "150ms" }}
          >
            Core Admins
          </h3>

          <div className="grid md:grid-cols-3 gap-8 text-left max-w-4xl mx-auto">

            <div
              onClick={() => setActiveIndex(0)}
              style={{ animationDelay: "200ms" }}
              className={`p-6 rounded-xl cursor-pointer transition-all duration-300 ease-out animate-fadeInUp
              ${activeIndex === 0
                ? "bg-sky-500 scale-105 shadow-qc-md ring-2 ring-sky-300"
                : "bg-[var(--card-bg)] hover:scale-105 hover:bg-[var(--card-bg-hover)]"}`}
            >
              <h4 className="font-bold text-lg mb-2">Ali Raza</h4>
              <p className={`transition-colors duration-300 ${activeIndex === 0 ? "text-slate-100" : "text-[var(--text-muted)]"}`}>
                System Administrator
              </p>
              <p className={`text-sm transition-colors duration-300 ${activeIndex === 0 ? "text-slate-100" : "text-[var(--text-muted)]"}`}>
                ali.raza@quickcheckhub.com
              </p>
            </div>

            <div
              onClick={() => setActiveIndex(1)}
              style={{ animationDelay: "250ms" }}
              className={`p-6 rounded-xl cursor-pointer transition-all duration-300 ease-out animate-fadeInUp
              ${activeIndex === 1
                ? "bg-sky-500 scale-105 shadow-qc-md ring-2 ring-sky-300"
                : "bg-[var(--card-bg)] hover:scale-105 hover:bg-[var(--card-bg-hover)]"}`}
            >
              <h4 className="font-bold text-lg mb-2">Sana Iqbal</h4>
              <p className={`transition-colors duration-300 ${activeIndex === 1 ? "text-slate-100" : "text-[var(--text-muted)]"}`}>
                Technical Lead
              </p>
              <p className={`text-sm transition-colors duration-300 ${activeIndex === 1 ? "text-slate-100" : "text-[var(--text-muted)]"}`}>
                sana.iqbal@quickcheckhub.com
              </p>
            </div>

            <div
              onClick={() => setActiveIndex(2)}
              style={{ animationDelay: "300ms" }}
              className={`p-6 rounded-xl cursor-pointer transition-all duration-300 ease-out animate-fadeInUp
              ${activeIndex === 2
                ? "bg-sky-500 scale-105 shadow-qc-md ring-2 ring-sky-300"
                : "bg-[var(--card-bg)] hover:scale-105 hover:bg-[var(--card-bg-hover)]"}`}
            >
              <h4 className="font-bold text-lg mb-2">Haris Ahmed</h4>
              <p className={`transition-colors duration-300 ${activeIndex === 2 ? "text-slate-100" : "text-[var(--text-muted)]"}`}>
                Operations Manager
              </p>
              <p className={`text-sm transition-colors duration-300 ${activeIndex === 2 ? "text-slate-100" : "text-[var(--text-muted)]"}`}>
                haris.ahmed@quickcheckhub.com
              </p>
            </div>

          </div>
        </div>

        {/* TEACHERS */}
        <div className="mb-16">
          <h3
            className="text-2xl text-sky-400 mb-6 font-semibold animate-fadeInUp"
            style={{ animationDelay: "350ms" }}
          >
            Faculty Members
          </h3>

          <div className="grid md:grid-cols-3 gap-8 text-left max-w-5xl mx-auto">
            <div
              className="bg-[var(--card-bg)] p-6 rounded-xl transition-all duration-300 hover:scale-105 hover:bg-[var(--card-bg-hover)] animate-fadeInUp"
              style={{ animationDelay: "400ms" }}
            >
              <h4 className="font-bold text-lg mb-2">Dr. Komal Hassan</h4>
              <p className="text-[var(--text-muted)]">Computer Science Department</p>
              <p className="text-[var(--text-muted)] text-sm">komal.hassan@cuis.edu.pk</p>
            </div>

            <div
              className="bg-[var(--card-bg)] p-6 rounded-xl transition-all duration-300 hover:scale-105 hover:bg-[var(--card-bg-hover)] animate-fadeInUp"
              style={{ animationDelay: "450ms" }}
            >
              <h4 className="font-bold text-lg mb-2">Dr. Ahmed Khan</h4>
              <p className="text-[var(--text-muted)]">Computer Science Department</p>
              <p className="text-[var(--text-muted)] text-sm">ahmed.khan@cuis.edu.pk</p>
            </div>

            <div
              className="bg-[var(--card-bg)] p-6 rounded-xl transition-all duration-300 hover:scale-105 hover:bg-[var(--card-bg-hover)] animate-fadeInUp"
              style={{ animationDelay: "500ms" }}
            >
              <h4 className="font-bold text-lg mb-2">Dr. Sara Malik</h4>
              <p className="text-[var(--text-muted)]">Computer Science Department</p>
              <p className="text-[var(--text-muted)] text-sm">sara.malik@cuis.edu.pk</p>
            </div>

            <div
              className="bg-[var(--card-bg)] p-6 rounded-xl transition-all duration-300 hover:scale-105 hover:bg-[var(--card-bg-hover)] animate-fadeInUp"
              style={{ animationDelay: "550ms" }}
            >
              <h4 className="font-bold text-lg mb-2">Dr. Usman Qureshi</h4>
              <p className="text-[var(--text-muted)]">Computer Science Department</p>
              <p className="text-[var(--text-muted)] text-sm">usman.qureshi@cuis.edu.pk</p>
            </div>

            <div
              className="bg-[var(--card-bg)] p-6 rounded-xl transition-all duration-300 hover:scale-105 hover:bg-[var(--card-bg-hover)] animate-fadeInUp"
              style={{ animationDelay: "600ms" }}
            >
              <h4 className="font-bold text-lg mb-2">Dr. Hina Shah</h4>
              <p className="text-[var(--text-muted)]">Computer Science Department</p>
              <p className="text-[var(--text-muted)] text-sm">hina.shah@cuis.edu.pk</p>
            </div>

          </div>
        </div>

        {/* STUDENT ACHIEVEMENTS */}
        <div className="mb-16">
          <h3
            className="text-2xl text-sky-400 mb-6 font-semibold animate-fadeInUp"
            style={{ animationDelay: "650ms" }}
          >
            Student Achievements
          </h3>

          <p
            className="text-[var(--text-muted)] max-w-3xl mx-auto text-lg md:text-xl animate-fadeInUp text-justify"
            style={{ animationDelay: "700ms" }}
          >
            Our students consistently excel in the Computer Science program, achieving top marks 
            and participating in national and international competitions. High-performing students 
            are recognized through awards, scholarships, and academic honors each year.
          </p>
        </div>
      </div>
    </div>
  );
}