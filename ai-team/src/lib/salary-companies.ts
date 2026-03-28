export const COMPANIES = {
  gotoschool: 'Gotoschool',
  via: 'ViA',
  rivance: 'リヴァンス',
} as const;

export type CompanyCode = keyof typeof COMPANIES;

export const DEFAULT_COMPANY: CompanyCode = 'gotoschool';

export function toCompanyCode(value: string | null | undefined): CompanyCode {
  if (!value) return DEFAULT_COMPANY;
  if (value in COMPANIES) return value as CompanyCode;
  return DEFAULT_COMPANY;
}

