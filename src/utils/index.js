export {
  normalizeEntityId,
  normalizeOptionLabel,
  sanitizeLine,
  sanitizeParagraph,
  normalizeEmail,
  slugify,
  splitFilterTagsText,
  stripDangerousContent,
} from "./sanitizers";

export {
  currency,
  discountPercent,
  computeOfferPrice,
  normalizeOfferDiscountMode,
  parseLoosePositiveNumber,
  resolveOfferDiscount,
  hasRawOfferMetadata,
} from "./currency";

export { readStorage, saveStorage, removeStorage } from "./storage";

export {
  normalizePhoneNumber,
  normalizeUserPhoneNumber,
  normalizeWhatsAppInternationalNumber,
} from "./phone";

export {
  normalizeSafeUrl,
  isValidEmail,
  normalizeContactEmail,
  buildMailtoLink,
  buildWhatsAppLink,
  buildWhatsAppApiSendLink,
  buildWhatsAppWebSendLink,
  parseWhatsAppTargetFromUrl,
  buildWhatsAppLinkFromBase,
  resolveWhatsAppLaunchUrls,
  launchExternalUrl,
  launchWhatsAppUrl,
  preOpenExternalWindow,
  closeExternalWindow,
} from "./url";

export { copyTextToClipboard } from "./clipboard";

export {
  estimateDataUrlBytes,
  normalizeImageSource,
  fileToDataUrl,
} from "./fileUpload";

export { createUid, createUuid } from "./uid";

export { formatMinutesRemaining, formatAdminTimestamp } from "./formatting";

export {
  hasStrongPassword,
  normalizeUsername,
  buildUsernameFromAuth,
  getPasswordChecks,
  buildAuthValidation,
} from "./auth";
