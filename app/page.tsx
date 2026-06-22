"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

function generateSubscriptionId() {
  return `PRX${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

export default function Home() {
  const [addForm, setAddForm] = useState({
    partnerName: "FairShare",
    affinityGroup: "Dan Test Co",
    subscriptionType: "One Pet",
    memberFirst: "",
    memberLast: "",
    memberSubID: "",
    memberEmail: "",
    memberPhone: "",
    petName: "",
    petSpecies: "",
    petBreed: "",
    petSex: "",
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const partnerName = params.get("utm_source")?.trim() || "";
    const affinityGroup = params.get("utm_medium")?.trim() || "";
    const campaign = params.get("utm_campaign")?.trim() || "";
    const lastName = params.get("utm_id")?.trim() || "";

    if (!partnerName || !affinityGroup) {
      setIsError(true);
      setResult("Missing required URL parameters: utm_source and/or utm_medium");
      return;
    }

    const generatedSubID =
      campaign.toLowerCase() === "x"
        ? generateSubscriptionId()
        : campaign;

    const cleanedLastName =
      lastName.toLowerCase() === "x"
        ? ""
        : lastName;

    setAddForm((prev) => ({
      ...prev,
      partnerName: partnerName || prev.partnerName,
      affinityGroup: affinityGroup || prev.affinityGroup,
      memberSubID: generatedSubID || prev.memberSubID,
      memberLast: cleanedLastName || prev.memberLast,
    }));
  }, []);

  const [result, setResult] = useState("No request sent yet.");
  const [isError, setIsError] = useState(false);

  async function runAction(action: string, payload: object) {
    if (!validate(action)) return;

    setIsError(false);
    setResult("Sending request...");

    try {
      const response = await fetch("/api/pet-service", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, payload }),
      });

      const data = await response.json();

      setIsError(!response.ok);
      setResult(JSON.stringify(data, null, 2));
    } catch (err) {
      setIsError(true);
      setResult(err instanceof Error ? err.message : "Unknown error");
    }
  }

  function updateAddForm(field: string, value: string) {
    setAddForm((prev) => ({ ...prev, [field]: value }));
  }

  function validate(action: string) {
    if (action === "addMemberAndPet") {
      const required = [
        ["Partner Name", addForm.partnerName],
        ["Affinity Group", addForm.affinityGroup],
        ["Member Subscription ID", addForm.memberSubID],
        ["Member First", addForm.memberFirst],
        ["Member Last", addForm.memberLast],
        ["Member Email", addForm.memberEmail],
        ["Mobile Phone", addForm.memberPhone],
        ["Pet Name", addForm.petName],
        ["Pet Species", addForm.petSpecies],
        ["Pet Sex", addForm.petSex],
      ];

      const missing = required.filter(([_, value]) => !value.trim()).map(([name]) => name);

      if (missing.length > 0) {
        setIsError(true);
        setResult("Please complete required fields:\n\n" + missing.join("\n"));
        return false;
      }
    }
    return true;
  }

  function getSubscriptionPrice(subscriptionType: string) {
    if (subscriptionType === "One Pet") return "$4.99";
    if (subscriptionType === "Two Pets") return "$5.99";
    if (subscriptionType === "3 or More Pets") return "$6.99";
    return "$4.99";
  }

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
            style={{
               height: "auto",
            }}
          />

          <h1 style={titleStyle}>Pet Registration</h1>
        </header>

        <div style={accentLineStyle} />

        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Add Member and/or Pet</h2>

        <h3 style={subSectionTitleStyle}>Member Information</h3>

        <div style={gridStyle}>
          <Input required label="Partner Name" value={addForm.partnerName} onChange={(v) => updateAddForm("partnerName", v)} />
          <Input required label="Affinity Group" value={addForm.affinityGroup} onChange={(v) => updateAddForm("affinityGroup", v)} />
          <Input required label="Member Subscription ID" value={addForm.memberSubID} onChange={(v) => updateAddForm("memberSubID", v)} />

          <div>
            <label style={labelStyle}>Subscription Type</label>
            <select
              value={addForm.subscriptionType}
              onChange={(e) => updateAddForm("subscriptionType", e.target.value)}
              style={inputStyle}
            >
              <option value="One Pet">One Pet</option>
              <option value="Two Pets">Two Pets</option>
              <option value="3 or More Pets">3 or More Pets</option>
            </select>
          </div>

          <div>
            <label style={labelStyle}>Price</label>
            <input
              value={getSubscriptionPrice(addForm.subscriptionType)}
              readOnly
              style={{
                ...inputStyle,
                fontWeight: "bold",
                backgroundColor: "#f9fafb",
              }}
            />
          </div>

          <Input required label="Member First" value={addForm.memberFirst} onChange={(v) => updateAddForm("memberFirst", v)} />
          <Input required label="Member Last" value={addForm.memberLast} onChange={(v) => updateAddForm("memberLast", v)} />
          <Input required label="Member Email" value={addForm.memberEmail} onChange={(v) => updateAddForm("memberEmail", v)} />
          <Input required label="Mobile Phone" value={addForm.memberPhone} onChange={(v) => updateAddForm("memberPhone", v)} />
        </div>

        <div style={sectionDividerStyle} />

        <h3 style={subSectionTitleStyle}>Pet Information</h3>

        <div style={gridStyle}>
          <Input required label="Pet Name" value={addForm.petName} onChange={(v) => updateAddForm("petName", v)} />
          <Input required label="Pet Species" value={addForm.petSpecies} onChange={(v) => updateAddForm("petSpecies", v)} />
          <Input label="Pet Breed" value={addForm.petBreed} onChange={(v) => updateAddForm("petBreed", v)} />
          <Input required label="Pet Sex" value={addForm.petSex} onChange={(v) => updateAddForm("petSex", v)} />
        </div>

          <button style={primaryButtonStyle} onClick={() => runAction("addMemberAndPet", addForm)}>
            Add Member / Pet
          </button>
        </section>

        <section style={responseCardStyle}>
          <h2 style={sectionTitleStyle}>API Response</h2>

          <pre
            style={{
              ...responseStyle,
              color: isError ? "#b42318" : "#047857",
              borderColor: isError ? "#f5c2c0" : "#b7e4c7",
              backgroundColor: isError ? "#fff5f5" : "#f0fdf4",
            }}
          >
            {result}
          </pre>
        </section>
      </div>
    </main>
  );
}

function Input({
  label,
  value,
  onChange,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <div>
      <label style={labelStyle}>
        {label}
        {required && <span style={requiredStyle}> *</span>}
      </label>
      <input
        value={value}
        placeholder={`Enter ${label}`}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
      />
    </div>
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
  color: "#1B2A41",
};

const subtitleStyle: React.CSSProperties = {
  margin: 0,
  color: "#4b5563",
  fontSize: 16,
};

const accentLineStyle: React.CSSProperties = {
  height: 5,
  width: "100%",
  background: emerald,
  borderRadius: 999,
  margin: "18px 0 28px",
};

const cardStyle: React.CSSProperties = {
  border: "1px solid #d9e2df",
  borderRadius: 18,
  padding: 26,
  marginBottom: 28,
  backgroundColor: "#ffffff",
  boxShadow: "0 8px 24px rgba(27, 42, 65, 0.06)",
};

const responseCardStyle = {
  ...cardStyle,
  marginBottom: 0,
};

const sectionTitleStyle: React.CSSProperties = {
  margin: "0 0 18px",
  fontSize: 22,
  color: navy,
  fontFamily: "Georgia, serif",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: "14px",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontWeight: 700,
  marginBottom: 6,
  fontSize: 14,
  color: navy,
};

const requiredStyle: React.CSSProperties = {
  color: "#b42318",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 42,
  padding: "8px 11px",
  fontSize: 15,
  border: "1px solid #9ca3af",
  borderRadius: 8,
  backgroundColor: "#ffffff",
  color: "#111827",
  boxSizing: "border-box",
  outlineColor: emerald,
};

const primaryButtonStyle: React.CSSProperties = {
  marginTop: 22,
  padding: "12px 22px",
  fontSize: 16,
  fontWeight: 700,
  cursor: "pointer",
  border: "none",
  borderRadius: 10,
  backgroundColor: emerald,
  color: "#ffffff",
  boxShadow: "0 4px 12px rgba(4, 120, 87, 0.25)",
};

const secondaryButtonStyle: React.CSSProperties = {
  ...primaryButtonStyle,
  backgroundColor: navy,
  boxShadow: "0 4px 12px rgba(27, 42, 65, 0.25)",
};

const subSectionTitleStyle: React.CSSProperties = {
  margin: "18px 0 14px",
  fontSize: 18,
  fontFamily: "Georgia, serif",
  color: navy,
};

const sectionDividerStyle: React.CSSProperties = {
  height: 1,
  backgroundColor: "#d9e2df",
  margin: "24px 0 8px",
};

const responseStyle: React.CSSProperties = {
  padding: 16,
  whiteSpace: "pre-wrap",
  borderRadius: 10,
  fontWeight: 700,
  border: "1px solid",
  overflowX: "auto",
};