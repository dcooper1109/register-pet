"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

function generateSubscriptionId() {
  return `PRX${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

type Pet = {
  petName: string;
  petSpecies: string;
  petBreed: string;
  petSex: string;
};

const blankPet: Pet = {
  petName: "",
  petSpecies: "",
  petBreed: "",
  petSex: "",
};

function getRequiredPetCount(subscriptionType: string) {
  if (subscriptionType === "One Pet") return 1;
  if (subscriptionType === "Two Pets") return 2;
  if (subscriptionType === "3 or More Pets") return 3;
  return 1;
}

function buildPets(count: number, existingPets: Pet[] = []) {
  return Array.from({ length: count }, (_, index) => ({
    ...blankPet,
    ...(existingPets[index] || {}),
  }));
}

export default function Home() {
  const [addForm, setAddForm] = useState({
    partnerName: "Direct Registration",
    affinityGroup: "D2C",
    subscriptionType: "One Pet",
    memberFirst: "",
    memberLast: "",
    memberSubID: "",
    memberEmail: "",
    memberPhone: "",
  });

  const [pets, setPets] = useState<Pet[]>(buildPets(1));
  const [result, setResult] = useState("No request sent yet.");
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const partnerName = params.get("utm_source")?.trim() || "";
    const affinityGroup = params.get("utm_medium")?.trim() || "";
    const campaign = params.get("utm_campaign")?.trim() || "";
    const lastName = params.get("utm_id")?.trim() || "";

    if (!partnerName || !affinityGroup) {
      setAddForm((prev) => ({
        ...prev,
        partnerName: prev.partnerName || "Direct Registration",
        affinityGroup: prev.affinityGroup || "D2C",
        memberSubID: generateSubscriptionId(),
      }));

      setIsError(false);
      setResult("No request sent yet.");
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

  async function runAction(action: string) {
    if (!validate(action)) return;

    setIsError(false);
    setResult("Sending request...");

    const firstPet = pets[0] || blankPet;

    const payload = {
      ...addForm,
      mobilePhone: addForm.memberPhone,
      pets,
    };

    try {
      const response = await fetch("/api/pet-service", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, payload }),
      });

      const data = await response.json();

      setIsError(!response.ok);

      if (response.ok && data.success) {
        setResult("Member/Pet(s) successfully added. Redirecting to login...");

        setTimeout(() => {
          window.location.href = "https://purchase.petvantagerx.com";
        }, 5000); // 10 seconds
      } else {
        setResult(data.message || data.error || "Request failed.");
      }
    } catch (err) {
      setIsError(true);
      setResult(err instanceof Error ? err.message : "Unknown error");
    }
  }

  function updateAddForm(field: string, value: string) {
    setAddForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubscriptionTypeChange(value: string) {
    const requiredPetCount = getRequiredPetCount(value);

    setAddForm((prev) => ({ ...prev, subscriptionType: value }));
    setPets((prevPets) => buildPets(requiredPetCount, prevPets));
  }

  function updatePet(index: number, field: keyof Pet, value: string) {
    setPets((prevPets) => {
      const updatedPets = [...prevPets];
      updatedPets[index] = {
        ...updatedPets[index],
        [field]: value,
      };
      return updatedPets;
    });
  }

  function addPet() {
    setPets((prevPets) => [...prevPets, { ...blankPet }]);
  }

  function removePet(index: number) {
    const requiredPetCount = getRequiredPetCount(addForm.subscriptionType);

    setPets((prevPets) => {
      if (prevPets.length <= requiredPetCount) return prevPets;
      return prevPets.filter((_, petIndex) => petIndex !== index);
    });
  }

  function validate(action: string) {
    if (action === "addMemberAndPet") {
      const required = [
        ["Member Subscription ID", addForm.memberSubID],
        ["Partner Name", addForm.partnerName],
        ["Group", addForm.affinityGroup],
        ["Subscription Type", addForm.subscriptionType],
        ["Member First", addForm.memberFirst],
        ["Member Last", addForm.memberLast],
        ["Member Email", addForm.memberEmail],
        ["Mobile Phone", addForm.memberPhone],
      ];

      const missing = required
        .filter(([_, value]) => !value.trim())
        .map(([name]) => name);

      const requiredPetCount = getRequiredPetCount(addForm.subscriptionType);
      const incompletePets: number[] = [];

      pets.slice(0, requiredPetCount).forEach((pet, index) => {
        if (
          !pet.petName.trim() ||
          !pet.petSpecies.trim() ||
          !pet.petSex.trim()
        ) {
          incompletePets.push(index + 1);
        }
      });

      if (missing.length > 0 || incompletePets.length > 0) {
        setIsError(true);

        let message = "Please complete required fields:";

        if (missing.length > 0) {
          message += "\n\n" + missing.join("\n");
        }

        if (incompletePets.length > 0) {
          message +=
            "\n\nComplete Pet Name, Pet Species, and Pet Sex for Pet Information " +
            incompletePets.join(", ") +
            ".";
        }

        setResult(message);
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

  const hidePartnerFields = addForm.partnerName === "Direct Registration";

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
          <h2 style={sectionTitleStyle}>Create Subscription and add Pet Information</h2>

          <h3 style={subSectionTitleStyle}>Subscriber Information</h3>

          <div style={gridStyle}>
            <Input
              required
              label="Member Subscription ID"
              value={addForm.memberSubID}
              onChange={(v) => updateAddForm("memberSubID", v)}
              readOnly
            />

            {hidePartnerFields ? (
              <>
                <div />
                <div />
              </>
            ) : (
              <>
                <Input
                  required
                  label="Partner Name"
                  value={addForm.partnerName}
                  onChange={(v) => updateAddForm("partnerName", v)}
                  readOnly
                />
                <Input
                  required
                  label="Group"
                  value={addForm.affinityGroup}
                  onChange={(v) => updateAddForm("affinityGroup", v)}
                  readOnly
                />
              </>
            )}

            <div>
              <label style={labelStyle}>Subscription Type</label>
              <select
                value={addForm.subscriptionType}
                onChange={(e) => handleSubscriptionTypeChange(e.target.value)}
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

          {pets.map((pet, index) => (
            <div key={index} style={petCardStyle}>
              <div style={petHeaderStyle}>
                <h4 style={petTitleStyle}>Pet Information {index + 1}</h4>

                {pets.length > getRequiredPetCount(addForm.subscriptionType) && (
                  <button
                    type="button"
                    style={removePetButtonStyle}
                    onClick={() => removePet(index)}
                  >
                    Remove
                  </button>
                )}
              </div>

              <div style={gridStyle}>
                <Input required label="Pet Name" value={pet.petName} onChange={(v) => updatePet(index, "petName", v)} />
                <Input required label="Pet Species" value={pet.petSpecies} onChange={(v) => updatePet(index, "petSpecies", v)} />
                <Input label="Pet Breed" value={pet.petBreed} onChange={(v) => updatePet(index, "petBreed", v)} />
                <div>
                  <label style={labelStyle}>
                    Pet Sex
                    <span style={requiredStyle}> *</span>
                  </label>

                  <select
                    value={pet.petSex}
                    onChange={(e) => updatePet(index, "petSex", e.target.value)}
                    style={inputStyle}
                  >
                    <option value="">Select Pet Sex</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
              </div>
            </div>
          ))}

          {addForm.subscriptionType === "3 or More Pets" && (
            <button type="button" style={secondaryButtonStyle} onClick={addPet}>
              Add Another Pet
            </button>
          )}

          <button style={primaryButtonStyle} onClick={() => runAction("addMemberAndPet")}>
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
  readOnly = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  readOnly?: boolean;
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
        readOnly={readOnly}
        style={{
          ...inputStyle,
          backgroundColor: readOnly ? "#f3f4f6" : "#ffffff",
          cursor: readOnly ? "default" : "text",
        }}
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
  marginRight: 12,
  backgroundColor: navy,
  boxShadow: "0 4px 12px rgba(27, 42, 65, 0.25)",
};

const removePetButtonStyle: React.CSSProperties = {
  padding: "7px 11px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  border: "1px solid #d9e2df",
  borderRadius: 8,
  backgroundColor: "#ffffff",
  color: navy,
};

const subSectionTitleStyle: React.CSSProperties = {
  margin: "18px 0 14px",
  fontSize: 18,
  fontFamily: "Georgia, serif",
  color: navy,
};

const petCardStyle: React.CSSProperties = {
  border: "1px solid #d9e2df",
  borderRadius: 14,
  padding: 16,
  marginBottom: 16,
  backgroundColor: "#fbfdfc",
};

const petHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  marginBottom: 12,
};

const petTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 16,
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
