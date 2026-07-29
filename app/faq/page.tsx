"use client";

import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { partnerFaqs } from "./data";

function normalizePartnerName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export default function FAQPage() {
  return (
    <Suspense fallback={<FAQLoading />}>
      <FAQContent />
    </Suspense>
  );
}

function FAQContent() {
  const searchParams = useSearchParams();

  const partnerName = searchParams.get("partner") || "";
  const normalizedPartnerName = normalizePartnerName(partnerName);

  const currentPartnerFaqs =
    partnerFaqs[normalizedPartnerName] || [];

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <header style={headerStyle}>
          <Image
            src="/petvantagerx logo on white.png"
            alt="PetVantageRx"
            width={350}
            height={130}
            priority
            unoptimized
            style={{ height: "auto" }}
          />

          <h1 style={titleStyle}>
            Frequently Asked Questions
          </h1>
        </header>

        <div style={accentLineStyle} />

        <div style={topLinkRowStyle}>
          <Link href="/" style={topLinkButtonStyle}>
            Back to Registration
          </Link>
        </div>

        <section style={cardStyle}>
          <div style={faqListStyle}>
            {currentPartnerFaqs.length > 0 ? (
              currentPartnerFaqs.map((faq) => (
                <details
                  key={faq.question}
                  style={faqItemStyle}
                >
                  <summary style={faqQuestionStyle}>
                    {faq.question}
                  </summary>

                  <div style={faqAnswerStyle}>
                    {faq.answer}
                  </div>
                </details>
              ))
            ) : (
              <p style={{ margin: 0 }}>
                FAQ information is not currently available for this partner.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function FAQLoading() {
  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <section style={cardStyle}>
          Loading frequently asked questions...
        </section>
      </div>
    </main>
  );
}

const navy = "#1B2A41";
const emerald = "#3d7a4a";
const softBg = "#f7faf9";

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: softBg,
  fontFamily: "Arial, sans-serif",
  padding: "32px 16px",
  color: navy,
};

const shellStyle: React.CSSProperties = {
  maxWidth: 850,
  margin: "0 auto",
};

const headerStyle: React.CSSProperties = {
  backgroundColor: "#ffffff",
  borderRadius: 18,
  padding: "30px",
  marginBottom: 20,
  boxShadow: "0 8px 24px rgba(27, 42, 65, 0.08)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center",
};

const titleStyle: React.CSSProperties = {
  marginTop: 10,
  marginBottom: 4,
  fontSize: 34,
  fontFamily: "Georgia, serif",
  color: navy,
};

const accentLineStyle: React.CSSProperties = {
  height: 5,
  width: "100%",
  background: emerald,
  borderRadius: 999,
  margin: "18px 0 20px",
};

const topLinkRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  marginBottom: 20,
};

const topLinkButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 42,
  padding: "10px 18px",
  borderRadius: 10,
  backgroundColor: emerald,
  color: "#ffffff",
  fontSize: 15,
  fontWeight: 700,
  textDecoration: "none",
  boxShadow: "0 4px 12px rgba(4, 120, 87, 0.25)",
};

const cardStyle: React.CSSProperties = {
  border: "1px solid #d9e2df",
  borderRadius: 18,
  padding: 26,
  marginBottom: 28,
  backgroundColor: "#ffffff",
  boxShadow: "0 8px 24px rgba(27, 42, 65, 0.06)",
};

const faqListStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
};

const faqItemStyle: React.CSSProperties = {
  border: "1px solid #d9e2df",
  borderRadius: 10,
  backgroundColor: "#fbfdfc",
  overflow: "hidden",
};

const faqQuestionStyle: React.CSSProperties = {
  padding: "14px 16px",
  cursor: "pointer",
  fontWeight: 700,
  color: navy,
  fontSize: 15,
};

const faqAnswerStyle: React.CSSProperties = {
  padding: "0 16px 14px",
  color: "#374151",
  fontSize: 14,
  lineHeight: 1.6,
};