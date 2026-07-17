"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import PhoneInput, {
  isValidPhoneNumber,
} from "react-phone-number-input";

import "react-phone-number-input/style.css";

const TERMS_VERSION = "2026-06-24";

function generateSubscriptionId() {
  return `PRX${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

type Pet = {
  petName: string;
  petSpecies: string;
  petBreed: string;
  petSex: string;
};

type SubscriptionOption = {
  subscriptionType: string;
  subscriptionPrice: number;
};

const blankPet: Pet = {
  petName: "",
  petSpecies: "",
  petBreed: "",
  petSex: "",
};

const faqs = [
  {
    question: "What are the key benefits of our discount program?",
    answer: (
      <>
        <p>
          Transparent prices for pet parents. Save up to 50% compared with
          veterinary clinic prices.
        </p>
        <p>
          PetVantageRx works with reputable pet pharmacies that negotiate
          directly with manufacturers, allowing us to pass savings on to pet
          parents, plus an additional discount.
        </p>
        <p>
          Members receive savings on prescription pet medications, trusted
          human equivalents, vaccines, supplements, flea and tick treatments,
          heartworm prevention, and other everyday pet care products.
        </p>
      </>
    ),
  },
  {
    question: "Are your products the same ones sold at my veterinarian’s office?",
    answer: (
      <>
        <p>
          Yes. The medications and products available through PetVantageRx are
          the same trusted products available through many veterinary clinics,
          at lower prices.
        </p>
        <p>
          Our pharmacy partners are fully accredited and source products from
          manufacturers or licensed distributors. Products are stored and
          handled according to applicable standards.
        </p>
      </>
    ),
  },
  {
    question: "What does the subscription cost?",
    answer: (
      <p>
        The subscription costs $4.99 per month for your first pet and $3.99 per
        month for each additional pet.
      </p>
    ),
  },
  {
    question: "How do I enroll?",
    answer: (
      <>
        <p>To enroll:</p>
        <ul>
          <li>Visit PetVantageRx.com.</li>
          <li>Register yourself and your pet or pets.</li>
          <li>Complete your subscription purchase through the member portal.</li>
        </ul>
        <p>
          Once payment is processed, you and your pet or pets will be enrolled
          in the program.
        </p>
      </>
    ),
  },
  {
    question: "Will my subscription automatically renew each month or year?",
    answer: (
      <>
        <p>
          Yes. You can choose a monthly or annual subscription. You will be
          charged for the first term when you sign up, and the subscription will
          automatically renew using the payment method on file.
        </p>
        <p>
          To avoid the next charge, cancel before the current subscription term
          ends. After cancellation, benefits continue through the end of the
          paid term.
        </p>
      </>
    ),
  },
  {
    question: "Are there any additional savings opportunities?",
    answer: (
      <>
        <p>
          Yes. Eligible products may qualify for additional savings through a
          pharmacy partner’s Auto-Ship program.
        </p>
        <ul>
          <li>5% off prescription medications</li>
          <li>10% off over-the-counter medications</li>
        </ul>
      </>
    ),
  },
  {
    question: "Once I subscribe, how do I access the program?",
    answer: (
      <>
        <p>
          After your subscription purchase, you will receive an email and text
          message confirming your subscription and discount code.
        </p>
        <p>
          You will then be directed to the medication and product search page,
          where you can find the products prescribed for your pet and access
          discounted pricing.
        </p>
      </>
    ),
  },
  {
    question: "Can I use my discount code directly on a pharmacy partner’s website?",
    answer: (
      <>
        <p>
          No. You must access the pharmacy partner through the PetVantageRx Pet
          Parent Portal, Welcome Email, or Welcome Text so that your discount is
          applied correctly.
        </p>
      </>
    ),
  },
  {
    question: "What is your refund and cancellation policy?",
    answer: (
      <>
        <p>
          You can cancel at any time by logging into your Pet Parent account and
          selecting Cancel Subscription. Subscription fees are non-refundable
          and are not prorated except where the Terms and Conditions state
          otherwise.
        </p>
        <p>
          After cancellation, benefits remain available through the end of the
          current paid subscription term.
        </p>
      </>
    ),
  },
  {
    question: "I forgot my password. What should I do?",
    answer: (
      <p>
        Go to PetVantageRx.com, select Sign In, and then select Forgot Password.
        Enter the email address associated with your account to receive reset
        instructions.
      </p>
    ),
  },
  {
    question: "How do I change my password?",
    answer: (
      <p>
        After signing in, go to Account & Orders and select Profile. You can
        update and save your password there.
      </p>
    ),
  },
  {
    question: "Where can I see the subscription Terms and Conditions?",
    answer: (
      <p>
        The PetVantageRx Subscription Plan Terms and Conditions are displayed
        below as part of registration and can also be published at
        PetVantageRx.com/terms.
      </p>
    ),
  },
];

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
    subscriptionType: "",
    subscriptionPrice: "",
    memberFirst: "",
    memberLast: "",
    memberSubID: "",
    memberEmail: "",
    memberPhone: "",
  });

  const [pets, setPets] = useState<Pet[]>(buildPets(1));
  const [result, setResult] = useState("No request sent yet.");
  const [isError, setIsError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [termsScrolled, setTermsScrolled] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [returnUrl, setReturnUrl] = useState("");
  const [isEmbedded, setIsEmbedded] = useState(false);

  const [subscriptionOptions, setSubscriptionOptions] =
    useState<SubscriptionOption[]>([]);

  const [loadingPrices, setLoadingPrices] =
    useState(true);

  const [priceError, setPriceError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const incomingPartnerName = params.get("utm_source")?.trim() || "Direct Registration";
    const partnerName = params.get("utm_source")?.trim() || "";
    const affinityGroup = params.get("utm_medium")?.trim() || "";
    const campaign = params.get("utm_campaign")?.trim() || "";
    const lastName = params.get("utm_id")?.trim() || "";

    loadSubscriptionPrices(incomingPartnerName);

    const incomingReturnUrl = params.get("returnUrl")?.trim() || "";
    setReturnUrl(incomingReturnUrl);

    const embed = params.get("embed") === "true";
    setIsEmbedded(embed);

    console.log("Return URL received:", incomingReturnUrl);

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
      campaign.toLowerCase() === "x" ? generateSubscriptionId() : campaign;

    const cleanedLastName = lastName.toLowerCase() === "x" ? "" : lastName;

    setAddForm((prev) => ({
      ...prev,
      partnerName: partnerName || prev.partnerName,
      affinityGroup: affinityGroup || prev.affinityGroup,
      memberSubID: generatedSubID || prev.memberSubID,
      memberLast: cleanedLastName || prev.memberLast,
    }));
  }, []);

  function getRequiredPetCount(
    subscriptionType: string,
    options: SubscriptionOption[]
  ) {
    const selectedIndex = options.findIndex(
      (option) => option.subscriptionType === subscriptionType
    );

    return selectedIndex === -1 ? 1 : selectedIndex + 1;
  }

  async function loadSubscriptionPrices(
    partnerName: string
  ) {
    try {
      setLoadingPrices(true);
      setPriceError("");

      const response = await fetch("/api/getprice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          partnerName,
        }),
      });

      const data = await response.json();

      if (
        !response.ok ||
        data?.success !== true ||
        !Array.isArray(data?.subscriptionOptions)
      ) {
        throw new Error(
          data?.message ||
            "Unable to retrieve subscription pricing."
        );
      }

      const options: SubscriptionOption[] =
        data.subscriptionOptions
          .filter(
            (option: any) =>
              option?.subscriptionType &&
              option?.subscriptionPrice !== null &&
              option?.subscriptionPrice !== undefined
          )
          .map((option: any) => ({
            subscriptionType: String(
              option.subscriptionType
            ).trim(),
            subscriptionPrice: Number(
              option.subscriptionPrice
            ),
          }));

      setSubscriptionOptions(options);
    } catch (error) {
      console.error(
        "Subscription pricing error:",
        error
      );

      setSubscriptionOptions([]);

      setPriceError(
        error instanceof Error
          ? error.message
          : "Unable to retrieve subscription pricing."
      );
    } finally {
      setLoadingPrices(false);
    }
  }

  async function runAction(action: string) {
    if (!validate(action)) return;

    setIsError(false);
    setIsSubmitting(true);
    setResult("Sending request...");

    const acceptedAt = new Date().toISOString();

    const payload = {
      ...addForm,
      mobilePhone: addForm.memberPhone,
      pets,
      termsAccepted,
      termsVersion: "2026-06-24",
    };

    try {
      const response = await fetch("/api/pet-service", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          payload,
        }),
      });

      const data = await response.json();

      let responseBody =
        data?.response?.body ??
        data?.body ??
        data?.response ??
        data;

      /*
      * Power Automate or APIM may return body as a JSON string.
      */
      if (typeof responseBody === "string") {
        try {
          responseBody = JSON.parse(responseBody);
        } catch {
          // Keep it as a string when it is not JSON.
        }
      }

      /*
      * Handle an additional statusCode/body wrapper.
      */
      if (
        responseBody &&
        typeof responseBody === "object" &&
        responseBody.body
      ) {
        responseBody = responseBody.body;

        if (typeof responseBody === "string") {
          try {
            responseBody = JSON.parse(responseBody);
          } catch {
            // Keep it as a string when it is not JSON.
          }
        }
      }

      console.log("Full pet-service response:", data);
      console.log("Parsed response body:", responseBody);

      if (typeof responseBody === "string") {
        try {
          responseBody = JSON.parse(responseBody);
        } catch {
          // Leave responseBody as a string if it is not valid JSON.
        }
      }

      setIsError(!response.ok);

      if (
        response.ok &&
        typeof responseBody === "object" &&
        responseBody?.success === true
      ) {
        if (addForm.partnerName.trim() === "Direct Registration") {
          setResult("Registration saved. Preparing secure payment...");

          const registrationToken =
            responseBody?.registrationToken ??
            data?.registrationToken ??
            data?.body?.registrationToken ??
            data?.response?.registrationToken ??
            data?.response?.body?.registrationToken;

          if (!registrationToken) {

            console.error(
              "Registration token missing. Full response:",
              data
            );

            setIsError(true);
            setIsSubmitting(false);
            setResult(
              "The pending registration was created, but its registration ID was not returned."
            );
            return;
          }

          console.log(
            "Registration token received:",
            registrationToken
          );

          const checkoutResponse = await fetch(
            "/api/stripe/create-checkout-session",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                registrationToken,
                subscriptionType: addForm.subscriptionType,
                subscriptionPrice: addForm.subscriptionPrice,
                memberEmail: addForm.memberEmail,
                memberSubID: addForm.memberSubID,
                partnerName: addForm.partnerName,
                affinityGroup: addForm.affinityGroup,
              }),
            }
          );

          const checkoutData = await checkoutResponse.json();

          if (
            !checkoutResponse.ok ||
            !checkoutData.success ||
            !checkoutData.checkoutUrl
          ) {
            const checkoutError =
              checkoutData?.message ||
              checkoutData?.error ||
              "Unable to start Stripe Checkout.";

            setIsError(true);
            setIsSubmitting(false);
            setResult(checkoutError);
            return;
          }

          window.top!.location.href =
            checkoutData.checkoutUrl;

          return;
        }

        // Existing non-direct registration logic continues here.
        setResult("Registration successful. Redirecting...");

        setTimeout(() => {
          console.log("Partner:", addForm.partnerName);
          console.log("Returning to:", returnUrl);

          if (returnUrl) {
            window.top!.location.href = returnUrl;
            return;
          }

          setIsError(true);
          setIsSubmitting(false);
          setResult(
            "Registration succeeded, but the partner return URL was not received."
          );
        }, 5000);
      } else {
        let responseBody =
          data?.response?.body ??
          data?.body ??
          data?.response ??
          data;

        if (typeof responseBody === "string") {
          try {
            responseBody = JSON.parse(responseBody);
          } catch {
            // Leave it as a string if it is not JSON.
          }
        }

        const errorMessage =
          responseBody?.results ||
          responseBody?.message ||
          responseBody?.error ||
          data?.response?.body?.results ||
          data?.response?.results ||
          data?.body?.results ||
          data?.results ||
          data?.message ||
          data?.error ||
          (typeof responseBody === "string" ? responseBody : "") ||
          "Request failed.";

        setResult(errorMessage);
        setIsError(true);
        setIsSubmitting(false);
      }
    } catch (err) {
      console.error("Registration submission error:", err);

      setIsError(true);
      setIsSubmitting(false);
      setResult(
        err instanceof Error
          ? err.message
          : "An unknown registration error occurred."
      );
    }
  }

  function updateAddForm(field: string, value: string) {
    setAddForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubscriptionTypeChange(value: string) {
    const requiredPetCount = getRequiredPetCount(
      value,
      subscriptionOptions
    );

    const selectedOption = subscriptionOptions.find(
      (option) => option.subscriptionType === value
    );

    setAddForm((prev) => ({
      ...prev,
      subscriptionType: value,
      subscriptionPrice:
        selectedOption?.subscriptionPrice.toString() ?? "",
    }));

    setPets((prevPets) =>
      buildPets(requiredPetCount, prevPets)
    );
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
    const requiredPetCount = getRequiredPetCount(addForm.subscriptionType, subscriptionOptions);

    setPets((prevPets) => {
      if (prevPets.length <= requiredPetCount) return prevPets;
      return prevPets.filter((_, petIndex) => petIndex !== index);
    });
  }

  function handleTermsScroll(event: React.UIEvent<HTMLDivElement>) {
    const element = event.currentTarget;
    const isAtBottom =
      element.scrollHeight - element.scrollTop <= element.clientHeight + 8;

    if (isAtBottom) {
      setTermsScrolled(true);
    }
  }

  function validate(action: string) {
    if (action === "addMemberAndPet") {
      const required = [
        ["Member Subscription ID", addForm.memberSubID],
        ["Partner Name", addForm.partnerName],
        ["Group", addForm.affinityGroup],
        ["Subscription Type", addForm.subscriptionType],
        ["Subscription Price", addForm.subscriptionPrice],
        ["Member First", addForm.memberFirst],
        ["Member Last", addForm.memberLast],
        ["Member Email", addForm.memberEmail],
        ["Mobile Phone", addForm.memberPhone],
      ];

      const missing = required
        .filter(([_, value]) => !value.trim())
        .map(([name]) => name);

      const requiredPetCount = getRequiredPetCount(addForm.subscriptionType, subscriptionOptions);
      const incompletePets: number[] = [];

      pets.slice(0, requiredPetCount).forEach((pet, index) => {
        if (!pet.petName.trim() || !pet.petSpecies.trim() || !pet.petSex.trim()) {
          incompletePets.push(index + 1);
        }
      });

      if (!termsScrolled || !termsAccepted) {
        setIsError(true);
        setResult(
          !termsScrolled
            ? "Please scroll to the bottom of the Terms and Conditions before accepting them."
            : "Please check the box confirming that you have read and agree to the Terms and Conditions."
        );
        return false;
      }

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

      if (!isValidPhoneNumber(addForm.memberPhone)) {
        setIsError(true);
        setResult(
          "Please enter a valid mobile phone number, including the correct area code."
        );
        return false;
      }
    }
    return true;
  }

  function getSubscriptionPrice(subscriptionType: string) {
    const selectedOption = subscriptionOptions.find(
      (option) => option.subscriptionType === subscriptionType
    );

    if (!selectedOption) return "";

    return selectedOption.subscriptionPrice.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
    });
}

  const hidePartnerFields = addForm.partnerName === "Direct Registration";
  const submitDisabled = isSubmitting || !termsAccepted;

  return (
      <main
        style={{
          ...pageStyle,
          padding: isEmbedded ? "8px" : "32px 16px",
        }}
      >
      <div style={shellStyle}>
        {!isEmbedded && (
          <>
            <header style={headerStyle}>
              <Image
                src="/petvantagerx logo on white.png"
                alt="PetVantageRx"
                width={350}
                height={130}
                priority
                style={{ height: "auto" }}
              />

              <h1 style={titleStyle}>Pet Registration</h1>
            </header>

            <div style={accentLineStyle} />
          </>
        )}

        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>
            Create Subscription and Add Pet Information
          </h2>

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
                disabled={loadingPrices || subscriptionOptions.length === 0}
              >
                <option value="">
                  {loadingPrices
                    ? "Loading subscription options..."
                    : "Select Subscription Type"}
                </option>

                {subscriptionOptions.map((option) => (
                  <option
                    key={option.subscriptionType}
                    value={option.subscriptionType}
                  >
                    {option.subscriptionType}
                  </option>
                ))}
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

            <Input
              required
              label="Member First"
              value={addForm.memberFirst}
              onChange={(v) => updateAddForm("memberFirst", v)}
            />
            <Input
              required
              label="Member Last"
              value={addForm.memberLast}
              onChange={(v) => updateAddForm("memberLast", v)}
            />
            <Input
              required
              label="Member Email"
              value={addForm.memberEmail}
              onChange={(v) => updateAddForm("memberEmail", v)}
            />
            <div>
              <label style={labelStyle}>
                Mobile Phone
                <span style={requiredStyle}> *</span>
              </label>

              <PhoneInput
                defaultCountry="US"
                international={false}
                countryCallingCodeEditable={false}
                value={addForm.memberPhone}
                onChange={(value) =>
                  updateAddForm("memberPhone", value ?? "")
                }
                style={phoneInputContainerStyle}
                numberInputProps={{
                  style: phoneNumberInputStyle,
                  placeholder: "Enter Mobile Phone",
                }}
              />
            </div>
          </div>

          <div style={sectionDividerStyle} />

          <h3 style={subSectionTitleStyle}>Pet Information</h3>

          {pets.map((pet, index) => (
            <div key={index} style={petCardStyle}>
              <div style={petHeaderStyle}>
                <h4 style={petTitleStyle}>Pet Information {index + 1}</h4>

                {pets.length > getRequiredPetCount(addForm.subscriptionType, subscriptionOptions) && (
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
                <Input
                  required
                  label="Pet Name"
                  value={pet.petName}
                  onChange={(v) => updatePet(index, "petName", v)}
                />
                <Input
                  required
                  label="Pet Species"
                  value={pet.petSpecies}
                  onChange={(v) => updatePet(index, "petSpecies", v)}
                />
                <Input
                  label="Pet Breed"
                  value={pet.petBreed}
                  onChange={(v) => updatePet(index, "petBreed", v)}
                />
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

          {getRequiredPetCount(addForm.subscriptionType, subscriptionOptions) >= 3 && (
            <button
              type="button"
              style={secondaryButtonStyle}
              onClick={addPet}
            >
              Add Another Pet
            </button>
          )}

          <div style={sectionDividerStyle} />

          <h3 style={subSectionTitleStyle}>Terms and Conditions</h3>
          <p style={helperTextStyle}>
            Please read the complete Terms and Conditions. The acceptance box
            becomes available after you scroll to the bottom.
          </p>

          <div
            style={termsBoxStyle}
            onScroll={handleTermsScroll}
            tabIndex={0}
            aria-label="PetVantageRx Terms and Conditions"
          >
            <h4 style={termsHeadingStyle}>PetVantageRx Terms</h4>
            <p>
              <strong>Updated: June 24, 2026</strong>
            </p>

            <h5 style={termsSubheadingStyle}>1. Subscription</h5>
            <p>
              <strong>Cancellation.</strong> You may cancel your PetVantageRx
              Subscription by visiting PetVantageRx.com and logging into your Pet
              Parent account. Select Cancel Subscription and submit. Your
              subscription will be cancelled immediately. PetVantageRx does not
              prorate and there are no refunds for subscription fees paid, except
              as expressly provided in these Terms. If you cancel, you may
              continue to use subscription benefits until the end of your paid
              term.
            </p>
            <p>
              <strong>Auto-Renewal.</strong> You may select either a one-month or
              one-year subscription term. You will be charged immediately for the
              initial term. After the initial term, your subscription will
              automatically renew, and the credit or debit card on file will be
              charged for an additional term at the then-current fee plus
              applicable taxes, unless you cancel before the end of the current
              term.
            </p>
            <p>
              <strong>Other Limitations.</strong> PetVantageRx may accept or refuse
              subscriptions at its discretion. You may not transfer or assign
              your account or benefits. Members may not purchase products for
              resale, rental, or delivery to customers or prospective customers.
              Benefits may be added or removed from time to time.
            </p>
            <p>
              <strong>Fees.</strong> Subscription fees are stated during the
              signup process and may vary. Fees are non-refundable except as
              expressly stated in these Terms. Applicable taxes may apply. If all
              payment methods on file are declined, the subscription may be
              automatically cancelled and benefits will end.
            </p>
            <p>
              <strong>Terms and Conditions Changes.</strong> PetVantageRx may
              change subscription terms, benefits, or non-material aspects of the
              program. Continued enrollment after a change constitutes
              acceptance. If you do not agree to a change, you must cancel your
              subscription.
            </p>
            <p>
              <strong>Termination by Us.</strong> PetVantageRx may terminate a
              subscription or participation at its discretion. Refund eligibility
              depends on the reason for termination and the remaining paid term.
              No refund is required for conduct involving fraud, misuse,
              violations of these Terms or law, or conduct harmful to
              PetVantageRx or another user.
            </p>

            <h5 style={termsSubheadingStyle}>2. Use Limitations</h5>
            <p>
              <strong>Discount Codes.</strong> Discount codes may only be used by
              the subscribed pet parent or an immediate family member caring for
              the registered pet or pets. Transferring discount codes is
              prohibited. To use a discount code, you must access the pharmacy
              partner through your PetVantageRx account or an authorized
              PetVantageRx link. A discount code may not work when visiting a
              pharmacy partner directly.
            </p>

            <h5 style={termsSubheadingStyle}>
              3. Participating Retail Pharmacy Network
            </h5>
            <p>
              <strong>Network.</strong> PetVantageRx is not a pharmacy. It
              provides access to discounted veterinary medications and products
              through participating pharmacy partners. Prescription medications
              and other products may be fulfilled by accredited mail-order or
              online pharmacy partners.
            </p>

            <h5 style={termsSubheadingStyle}>4. Product and Services Information</h5>
            <p>
              <strong>Products.</strong> The program provides access to products
              that may require a prescription from a licensed veterinarian, as
              well as products that do not require a prescription. Prescription
              medication cannot be provided without a valid prescription from
              your pet’s veterinarian.
            </p>

            <p style={endOfTermsStyle}>End of Terms and Conditions</p>
          </div>

          <label style={termsCheckboxRowStyle}>
            <input
              type="checkbox"
              checked={termsAccepted}
              disabled={!termsScrolled}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              style={checkboxStyle}
            />
            <span>
              I have read and agree to the PetVantageRx Terms and Conditions
              dated June 24, 2026.
            </span>
          </label>

          {!termsScrolled && (
            <p style={scrollMessageStyle}>
              Scroll to the bottom of the Terms and Conditions to enable the
              acceptance checkbox.
            </p>
          )}

          <div style={actionResponseRowStyle}>
            <button
              type="button"
              disabled={submitDisabled}
              style={{
                ...primaryButtonStyle,
                ...(submitDisabled ? disabledButtonStyle : {}),
              }}
              onClick={() => runAction("addMemberAndPet")}
            >
              {isSubmitting ? "Submitting..." : "Add Member / Pet"}
            </button>

            <div style={responseFieldStyle}>
              <label style={labelStyle}>Submission Response</label>

              <textarea
                value={result}
                readOnly
                aria-label="API Response"
                style={{
                  ...responseTextAreaStyle,
                  color: isError ? "#b42318" : "#047857",
                  borderColor: isError ? "#f5c2c0" : "#b7e4c7",
                  backgroundColor: isError ? "#fff5f5" : "#f0fdf4",
                }}
              />
            </div>
          </div>
        </section>

        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Frequently Asked Questions</h2>

          <div style={faqListStyle}>
            {faqs.map((faq) => (
              <details key={faq.question} style={faqItemStyle}>
                <summary style={faqQuestionStyle}>{faq.question}</summary>
                <div style={faqAnswerStyle}>{faq.answer}</div>
              </details>
            ))}
          </div>
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
  color: navy,
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
  marginTop: 0,
  padding: "12px 22px",
  fontSize: 16,
  fontWeight: 700,
  cursor: "pointer",
  border: "none",
  borderRadius: 10,
  backgroundColor: emerald,
  color: "#ffffff",
  boxShadow: "0 4px 12px rgba(4, 120, 87, 0.25)",
  whiteSpace: "nowrap",
};

const disabledButtonStyle: React.CSSProperties = {
  backgroundColor: "#9ca3af",
  boxShadow: "none",
  cursor: "not-allowed",
  opacity: 0.8,
};

const secondaryButtonStyle: React.CSSProperties = {
  ...primaryButtonStyle,
  marginTop: 22,
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

const helperTextStyle: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: 14,
  lineHeight: 1.5,
  color: "#4b5563",
};

const termsBoxStyle: React.CSSProperties = {
  height: 330,
  overflowY: "auto",
  border: "1px solid #9ca3af",
  borderRadius: 10,
  padding: "18px 20px",
  backgroundColor: "#fbfdfc",
  fontSize: 14,
  lineHeight: 1.6,
  color: "#263548",
};

const termsHeadingStyle: React.CSSProperties = {
  margin: "0 0 4px",
  fontSize: 19,
  fontFamily: "Georgia, serif",
  color: navy,
};

const termsSubheadingStyle: React.CSSProperties = {
  margin: "20px 0 6px",
  fontSize: 16,
  color: navy,
};

const endOfTermsStyle: React.CSSProperties = {
  marginTop: 24,
  paddingTop: 14,
  borderTop: "1px solid #d9e2df",
  fontWeight: 700,
  textAlign: "center",
  color: emerald,
};

const termsCheckboxRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  marginTop: 14,
  fontSize: 14,
  fontWeight: 700,
  lineHeight: 1.5,
  color: navy,
};

const checkboxStyle: React.CSSProperties = {
  width: 18,
  height: 18,
  marginTop: 1,
  accentColor: emerald,
  flexShrink: 0,
};

const scrollMessageStyle: React.CSSProperties = {
  margin: "8px 0 0 28px",
  fontSize: 13,
  color: "#6b7280",
};

const actionResponseRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "end",
  gap: 18,
  marginTop: 22,
  flexWrap: "wrap",
};

const responseFieldStyle: React.CSSProperties = {
  flex: "1 1 420px",
  display: "flex",
  flexDirection: "column",
};

const responseTextAreaStyle: React.CSSProperties = {
  width: "100%",
  height: 50,
  minHeight: 50,
  padding: "11px",
  fontSize: 15,
  fontFamily: "Arial, sans-serif",
  fontWeight: 700,
  lineHeight: "24px",
  resize: "none",
  borderRadius: 8,
  border: "1px solid",
  boxSizing: "border-box",
  overflow: "hidden",
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

const phoneInputContainerStyle: React.CSSProperties = {
  width: "100%",
  height: 42,
  display: "flex",
  alignItems: "center",
  padding: "0 11px",
  border: "1px solid #9ca3af",
  borderRadius: 8,
  backgroundColor: "#ffffff",
  boxSizing: "border-box",
};

const phoneNumberInputStyle: React.CSSProperties = {
  width: "100%",
  height: 40,
  border: "none",
  outline: "none",
  fontSize: 15,
  backgroundColor: "transparent",
  color: "#111827",
};