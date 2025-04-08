import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

const getPlaidClient = () => {
  const configuration = new Configuration({
    basePath:
      PlaidEnvironments[
        (process.env.PLAID_ENV as keyof typeof PlaidEnvironments) || "sandbox"
      ],
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
        "PLAID-SECRET":
          (process.env.PLAID_ENV as keyof typeof PlaidEnvironments) ===
          "production"
            ? process.env.PLAID_PRODUCTION_SECRET
            : process.env.PLAID_SANDBOX_SECRET,
      },
    },
  });

  return new PlaidApi(configuration);
};

export const plaidClient = getPlaidClient();
