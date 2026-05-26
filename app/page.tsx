"use client";

import { useState } from "react";

export default function Home() {
  const [addForm, setAddForm] = useState({
    partnerName: "FairShare",
    affinityGroup: "Dan Test Co",
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

  const [cancelForm, setCancelForm] = useState({
    partnerName: "FairShare",
    memberLast: "",
    memberSubID: "",
    petName: "",
    cancelService: "",
  });

  const [result, setResult] = useState("No request sent yet.");
  const [isError, setIsError] = useState(false);

  async function runAction(action: string, payload: object) {
     if (!validate(action)) {
      return;
    }
    
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

  function updateCancelForm(field: string, value: string) {
    setCancelForm((prev) => ({ ...prev, [field]: value }));
  }

  function validate(action: string) {
    if (action === "addMemberAndPet") {
      const required = [
        ["Partner Name", addForm.partnerName],
        ["Affinity Group", addForm.affinityGroup],
        ["Member First", addForm.memberFirst],
        ["Member Last", addForm.memberLast],
        ["Member Subscription ID", addForm.memberSubID],
        ["Member Email", addForm.memberEmail],
        ["Mobile Phone", addForm.memberPhone],
        ["Pet Name", addForm.petName],
        ["Pet Species", addForm.petSpecies],
        ["Pet Sex", addForm.petSex],
      ];

      const missing = required
        .filter(([_, value]) => !value.trim())
        .map(([name]) => name);

      if (missing.length > 0) {
        setIsError(true);
        setResult(
          "Please complete required fields:\n\n" +
          missing.join("\n")
        );
        return false;
      }
    }

    if (
      action === "removePet" ||
      action === "cancelService" ||
      action === "reactivateService"
    ) {
      const required = [
        ["Partner Name", cancelForm.partnerName],
        ["Member Last", cancelForm.memberLast],
        ["Member Subscription ID", cancelForm.memberSubID],
      ];

      const missing = required
        .filter(([_, value]) => !value.trim())
        .map(([name]) => name);

      if (missing.length > 0) {
        setIsError(true);
        setResult(
          "Please complete required fields:\n\n" +
          missing.join("\n")
        );
        return false;
      }
    }

    return true;
  }

  return (
    <main style={pageStyle}>
      <h1>Pet Service Test Page</h1>

      <section style={cardStyle}>
        <h2>Add Member and/or Pet</h2>

        <Input required label="Partner Name" value={addForm.partnerName} onChange={(v) => updateAddForm("partnerName", v)} />
        <Input required label="Affinity Group" value={addForm.affinityGroup} onChange={(v) => updateAddForm("affinityGroup", v)} />
        <Input required label="Member First" value={addForm.memberFirst} onChange={(v) => updateAddForm("memberFirst", v)} />
        <Input required label="Member Last" value={addForm.memberLast} onChange={(v) => updateAddForm("memberLast", v)} />
        <Input required label="Member Subscription ID" value={addForm.memberSubID} onChange={(v) => updateAddForm("memberSubID", v)} />
        <Input required label="Member Email" value={addForm.memberEmail} onChange={(v) => updateAddForm("memberEmail", v)} />
        <Input required label="Mobile Phone" value={addForm.memberPhone} onChange={(v) => updateAddForm("memberPhone", v)} />
        <Input required label="Pet Name" value={addForm.petName} onChange={(v) => updateAddForm("petName", v)} />
        <Input required label="Pet Species" value={addForm.petSpecies} onChange={(v) => updateAddForm("petSpecies", v)} />
        <Input label="Pet Breed" value={addForm.petBreed} onChange={(v) => updateAddForm("petBreed", v)} />
        <Input required label="Pet Sex" value={addForm.petSex} onChange={(v) => updateAddForm("petSex", v)} />

        <button
          style={primaryButtonStyle}
          onClick={() => runAction("addMemberAndPet", addForm)}
        >
          Add Member / Pet
        </button>
      </section>

      <section style={cardStyle}>
        <h2>Cancel Service or Pet</h2>

        <Input required label="Partner Name" value={cancelForm.partnerName} onChange={(v) => updateCancelForm("partnerName", v)} />
        <Input required label="Member Last Name" value={cancelForm.memberLast} onChange={(v) => updateCancelForm("memberLast", v)} />
        <Input required label="Member Subscription ID" value={cancelForm.memberSubID} onChange={(v) => updateCancelForm("memberSubID", v)} />
        <Input label="Pet Name" value={cancelForm.petName} onChange={(v) => updateCancelForm("petName", v)} />

        <label style={labelStyle}>Cancel Service</label>
        <select
          value={cancelForm.cancelService}
          onChange={(e) => updateCancelForm("cancelService", e.target.value)}
          style={inputStyle}
        >
          <option value="">Blank - cancel pet only</option>
          <option value="Y">Y - cancel all services</option>
          <option value="N">N - reactivate all services</option>
        </select>

        <button
          style={dangerButtonStyle}
          onClick={() => {
            const action =
              cancelForm.cancelService === ""
                ? "removePet"
                : cancelForm.cancelService === "Y"
                ? "cancelService"
                : "reactivateService";

            const payload =
              cancelForm.cancelService === ""
                ? { ...cancelForm, cancelService: "" }
                : { ...cancelForm, petName: "" };

            runAction(action, payload);
          }}
        >
          Submit Cancellation / Reactivation
        </button>
      </section>

      <h2>API Response</h2>

      <pre
        style={{
          ...responseStyle,
          color: isError ? "red" : "green",
        }}
      >
        {result}
      </pre>
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
    <div style={{ marginBottom: 12 }}>
      <label style={labelStyle}>
        {label}
        {required && (
          <span style={{ color: "red" }}> *</span>
        )}
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

const pageStyle = {
  maxWidth: 900,
  margin: "40px auto",
  fontFamily: "Arial",
  padding: 20,
};

const cardStyle = {
  border: "2px solid #ccc",
  borderRadius: 12,
  padding: 24,
  marginBottom: 28,
  backgroundColor: "#ffffff",
};

const labelStyle = {
  display: "block",
  fontWeight: "bold",
  marginBottom: 4,
};

const inputStyle = {
  width: "100%",
  padding: 10,
  fontSize: 16,
  marginBottom: 8,
  border: "1px solid #888",
  borderRadius: 6,
  backgroundColor: "#ffffff",
  color: "#111111",
};

const primaryButtonStyle = {
  marginTop: 12,
  padding: "12px 20px",
  fontSize: 16,
  fontWeight: "bold",
  cursor: "pointer",
};

const dangerButtonStyle = {
  marginTop: 12,
  padding: "12px 20px",
  fontSize: 16,
  fontWeight: "bold",
  cursor: "pointer",
};

const responseStyle = {
  background: "#f4f4f4",
  padding: 15,
  whiteSpace: "pre-wrap",
  borderRadius: 8,
  fontWeight: "bold",
};