// Identifiers such as supplier, vehicle or shipment ids are random 63-bit numbers. JSON.parse would round them
// to the nearest double (6047483447382963523 -> 6047483447382963000), so integers that do not fit exactly
// are quoted before parsing and arrive as strings.
const MAX_SAFE_DIGITS = 15;

const isDigit = (char: string) => char >= "0" && char <= "9";

export const quoteLargeIntegers = (json: string): string => {
    let result = "";
    let index = 0;
    let inString = false;
    while (index < json.length) {
        const char = json[index];
        if (inString) {
            result += char;
            if (char === "\\") {
                result += json[index + 1] ?? "";
                index += 2;
                continue;
            }
            if (char === "\"") {
                inString = false;
            }
            index += 1;
            continue;
        }
        if (char === "\"") {
            inString = true;
            result += char;
            index += 1;
            continue;
        }
        if (char === "-" || isDigit(char)) {
            let end = index + 1;
            while (end < json.length && /[0-9.eE+-]/.test(json[end])) {
                end += 1;
            }
            const token = json.slice(index, end);
            const digits = token.replace("-", "");
            const integer = /^-?\d+$/.test(token);
            result += integer && digits.length > MAX_SAFE_DIGITS ? `"${token}"` : token;
            index = end;
            continue;
        }
        result += char;
        index += 1;
    }
    return result;
};

export const parseJson = <T>(json: string): T => JSON.parse(quoteLargeIntegers(json)) as T;
