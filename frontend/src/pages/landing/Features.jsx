import React, { useState } from "react";

export default function FeaturesSection() {
  const [activeIndex, setActiveIndex] = useState(null);

  const features = [
    {
      title: "Role-Based Authentication",
      desc: "Secure login with dedicated dashboards and access levels for Students, Teachers, and Admins.",
    },
    {
      title: "Assignment Management",
      desc: "Teachers create and manage assignments; students submit programming or text-based work securely.",
    },
    {
      title: "AI-Powered Evaluation",
      desc: "Gemini AI analyzes code logic, structure, and text quality to generate accurate evaluation results.",
    },
    {
      title: "Structural Plagiarism Detection",
      desc: "Peer similarity analysis compares extracted text from submissions on the same assignment and scores overlap for teacher review.",
    },
    {
      title: "Automated Grading & Feedback",
      desc: "Marks are assigned based on AI evaluation, with instant feedback available to students and teachers.",
    },
    {
      title: "Detailed Evaluation Reports",
      desc: "Teachers can generate and download in-depth evaluation reports for any assignment.",
    },
    {
      title: "Performance Analytics & Trends",
      desc: "Teacher dashboards show class and student performance through graphs and trend analysis.",
    },
    {
      title: "Secure MongoDB Data Management",
      desc: "Users, assignments, submissions, evaluations, and reports are securely stored and managed in the database.",
    },
  ];

  return (
    <div className="bg-[var(--bg)] text-[var(--text-primary)] min-h-screen">
      <div className="py-20 px-8">
        <h2 className="text-3xl text-center text-sky-400 mb-12 animate-fadeInUp">
          Key Features of QuickCheck Hub
        </h2>

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {features.map((feature, index) => (
            <div
              key={index}
              onClick={() => setActiveIndex(index)}
              style={{ animationDelay: `${index * 80}ms` }}
              className={`p-6 rounded-xl cursor-pointer transition-all duration-300 ease-out animate-fadeInUp
              ${activeIndex === index
                ? "bg-sky-500 scale-105 shadow-qc-md ring-2 ring-sky-300"
                : "bg-[var(--card-bg)] hover:scale-105 hover:bg-[var(--card-bg-hover)]"}`}
            >
              <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
              <p className={`text-sm transition-colors duration-300 text-justify ${activeIndex === index ? "text-slate-100" : "text-[var(--text-muted)]"}`}>
                {feature.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}