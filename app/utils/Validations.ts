import i18n from "../i18n/i18n";
import Regex from "./Regex";
import * as IbanTools from "ibantools";
import { Country } from "../models/Country";
import libphonenumber from "google-libphonenumber";

class ValidationsClass {
  public get Required() {
    return {
      required: {
        value: true,
        message: i18n.t("validation.required"),
      },
    };
  }

  public Iban(countries: Country[]) {
    return this.Custom((iban: string) => {
      iban = iban.split(" ").join("");
      return countries.find((c) => iban.toLowerCase().startsWith(c.symbol.toLowerCase()))?.enable
        ? IbanTools.validateIBAN(iban).valid
          ? true
          : "validation.iban_invalid"
        : "validation.iban_country_invalid";
    });
  }

  public get Mail() {
    return {
      pattern: {
        value: Regex.Mail,
        message: i18n.t("validation.pattern_invalid"),
      },
    };
  }

  public get Ref() {
    return {
      pattern: {
        value: /^\w{3}-\w{3}$/,
        message: i18n.t("validation.pattern_invalid"),
      },
    };
  }

  public get Phone() {
    return this.Custom((number: string) => {
      const phoneUtil = libphonenumber.PhoneNumberUtil.getInstance();
      if (number && !number.match(/^\+\d+ .+$/)) {
        return "validation.code_and_number";
      } else if (
        (number && !number.match(/^\+[\d ]*$/)) ||
        !phoneUtil.isValidNumber(phoneUtil.parseAndKeepRawInput(number))
      ) {
        return "validation.pattern_invalid";
      }

      return true;
    });
  }

  public get Address() {
    return {
      pattern: {
        value: /^(8\w{33}|d\w{33}|d\w{41})$/,
        message: i18n.t("validation.pattern_invalid"),
      },
    };
  }

  public get Signature() {
    return {
      pattern: {
        value: /^.{87}=$/,
        message: i18n.t("validation.pattern_invalid"),
      },
    };
  }

  public Custom = (validator: (value: any) => true | string) => ({
    validate: (val: any) => (typeof validator(val) == "boolean" ? validator(val) : i18n.t(validator(val) as string)),
  });
}

const Validations = new ValidationsClass();
export default Validations;
