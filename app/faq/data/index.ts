import type { FaqItem } from "./types";
import { fairshareFaqs } from "./fairshare";
import { testclientFaqs } from "./testclient";
import { metlifeFaqs } from "./metlife";

export const partnerFaqs: Record<string, FaqItem[]> = {
  fairshare: fairshareFaqs,
  testclient: testclientFaqs,
  metlife: metlifeFaqs,
};