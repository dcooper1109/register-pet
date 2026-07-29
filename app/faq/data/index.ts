import type { FaqItem } from "./types";
import { fairshareFaqs } from "./fairshare";
import { testclientFaqs } from "./testclient";

export const partnerFaqs: Record<string, FaqItem[]> = {
  fairshare: fairshareFaqs,
  testclient: testclientFaqs,
};