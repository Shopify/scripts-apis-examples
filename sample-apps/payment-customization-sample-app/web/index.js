import { join } from "path";
import { readFileSync } from "fs";
import express from "express";
import cookieParser from "cookie-parser";
import { Shopify } from "@shopify/shopify-api";
import dotenv from 'dotenv'

import applyAuthMiddleware from "./middleware/auth.js";
import verifyRequest from "./middleware/verify-request.js";
import { setupGDPRWebHooks } from "./gdpr.js";
import redirectToAuth from "./helpers/redirect-to-auth.js";
import { AppInstallations } from "./app_installations.js";

const USE_ONLINE_TOKENS = false;

const PORT = parseInt(process.env.BACKEND_PORT || process.env.PORT, 10);

// TODO: There should be provided by env vars
const DEV_INDEX_PATH = `${process.cwd()}/frontend/`;
const PROD_INDEX_PATH = `${process.cwd()}/frontend/dist/`;

const DB_PATH = `${process.cwd()}/database.sqlite`;

const {SHOPIFY_HIDE_PAYMENT_BY_NAME_AND_CART_SUBTOTAL_ID} = dotenv.parse(readFileSync(join(process.cwd(), '../', '.env'), "utf8"));

const METAFIELD = {
  namespace: "payment-customization-hide",
  key: "function-configuration"
}

Shopify.Context.initialize({
  API_KEY: process.env.SHOPIFY_API_KEY,
  API_SECRET_KEY: process.env.SHOPIFY_API_SECRET,
  SCOPES: process.env.SCOPES.split(","),
  HOST_NAME: process.env.HOST.replace(/https?:\/\//, ""),
  HOST_SCHEME: process.env.HOST.split("://")[0],
  API_VERSION: "unstable",
  IS_EMBEDDED_APP: true,
  // This should be replaced with your preferred storage strategy
  SESSION_STORAGE: new Shopify.Session.SQLiteSessionStorage(DB_PATH),
});

Shopify.Webhooks.Registry.addHandler("APP_UNINSTALLED", {
  path: "/api/webhooks",
  webhookHandler: async (_topic, shop, _body) => {
    await AppInstallations.delete(shop);
  },
});

// The transactions with Shopify will always be marked as test transactions, unless NODE_ENV is production.
// See the ensureBilling helper to learn more about billing in this template.
const BILLING_SETTINGS = {
  required: false,
  // This is an example configuration that would do a one-time charge for $5 (only USD is currently supported)
  // chargeName: "My Shopify One-Time Charge",
  // amount: 5.0,
  // currencyCode: "USD",
  // interval: BillingInterval.OneTime,
};

// This sets up the mandatory GDPR webhooks. You’ll need to fill in the endpoint
// in the “GDPR mandatory webhooks” section in the “App setup” tab, and customize
// the code when you store customer data.
//
// More details can be found on shopify.dev:
// https://shopify.dev/apps/webhooks/configuration/mandatory-webhooks
setupGDPRWebHooks("/api/webhooks");

// export for test use only
export async function createServer(
  root = process.cwd(),
  isProd = process.env.NODE_ENV === "production",
  billingSettings = BILLING_SETTINGS
) {
  const app = express();

  app.set("use-online-tokens", USE_ONLINE_TOKENS);
  app.use(cookieParser(Shopify.Context.API_SECRET_KEY));

  applyAuthMiddleware(app, {
    billing: billingSettings,
  });

  // Do not call app.use(express.json()) before processing webhooks with
  // Shopify.Webhooks.Registry.process().
  // See https://github.com/Shopify/shopify-api-node/blob/main/docs/usage/webhooks.md#note-regarding-use-of-body-parsers
  // for more details.
  app.post("/api/webhooks", async (req, res) => {
    try {
      await Shopify.Webhooks.Registry.process(req, res);
      console.log(`Webhook processed, returned status code 200`);
    } catch (e) {
      console.log(`Failed to process webhook: ${e.message}`);
      if (!res.headersSent) {
        res.status(500).send(e.message);
      }
    }
  });

  // All endpoints after this point will require an active session
  app.use(express.json());

  app.use(
    "/api/*",
    verifyRequest(app, {
      billing: billingSettings,
    })
  );

  app.get("/api/payment-customizations", async (req, res) => {
    const session = await Shopify.Utils.loadCurrentSession(
      req,
      res,
      app.get("use-online-tokens")
    );

    // GraphQLClient takes in the shop url and the accessToken for that shop.
    const client = new Shopify.Clients.Graphql(
      session.shop,
      session.accessToken
    );

    // Use client.query and pass your query as `data`.
    let all = [];

    try {
      const result = await client.query({
        data: `{
          paymentCustomizations(first: 10) {
            edges {
              node {
                id
                title
              }
            }
          }
        }`,
      });

      all = result.body.data.paymentCustomizations.edges.map(
        (edge) => edge.node
      );
    } catch (error) {
      if (error instanceof Shopify.Errors.GraphqlQueryError)
        res.status(500).send({ error: error.response });
      else res.status(500).send({ error: error.message });
    }

    console.log(all);

    res.status(200).send(all);
  });

  app.post("/api/payment-customization", async (req, res) => {
    const session = await Shopify.Utils.loadCurrentSession(
      req,
      res,
      app.get("use-online-tokens")
    );

    // GraphQLClient takes in the shop url and the accessToken for that shop.
    const client = new Shopify.Clients.Graphql(
      session.shop,
      session.accessToken
    );

    const payload = req.body;

    console.log({payload})

    // Use client.query and pass your query as `data`.
    let customization = {};
    try {
      const result = await client.query({
        data: {
          query: `
            mutation PaymentCustomization($input: PaymentCustomizationInput!) {
              paymentCustomizationCreate(paymentCustomization: $input) {
                paymentCustomization {
                  id
                  title
                  enabled
                }
              }
            }
          `,
          variables: {
            input: {
              functionId: SHOPIFY_HIDE_PAYMENT_BY_NAME_AND_CART_SUBTOTAL_ID,
              title: `Hide ${payload.paymentMethod} if cart subtotal is bigger than ${payload.cartSubtotal}`,
              enabled: true,
            },
          },
        }
      });

      customization =
        result.body.data.paymentCustomizationCreate.paymentCustomization;
    } catch (error) {
      if (error instanceof Shopify.Errors.GraphqlQueryError)
        return res.status(500).send({ error: error.response });
      else return res.status(500).send({ error: error.message });
    }

    // Use client.query and pass your query as `data`.
    let metafield = {};
    try {
      const result = await client.query({
        data: {
          query: `
            mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
              metafieldsSet(metafields: $metafields) {
                metafields {
                  id
                  key
                  namespace
                  value
                  createdAt
                  updatedAt
                }
              }
            }
          `,
          variables: {
            metafields: [{
              ...METAFIELD,
              ownerId: customization.id,
              type: 'json',
              value: JSON.stringify(payload)
            }],
          },
        }
      });

      metafield = result.body.data.metafieldsSet.metafields[0];
    } catch (error) {
      if (error instanceof Shopify.Errors.GraphqlQueryError)
        return res.status(500).send({ error: error.response });
      else return res.status(500).send({ error: error.message });
    }

    return res.status(200).send({ customization, metafield });
  });

  app.put("/api/payment-customizations/:id", () => {
    // update
  });

  // app.get("/api/payment-gateway", async (req, res) => {
  //   const session = await Shopify.Utils.loadCurrentSession(
  //     req,
  //     res,
  //     app.get("use-online-tokens")
  //   );

  //   const { PaymentGateway } = await import(
  //     `@shopify/shopify-api/dist/rest-resources/${Shopify.Context.API_VERSION}/index.js`
  //   );

  //   const countData = await PaymentGateway.all({ session });

  //   console.log(countData);
  //   res.status(200).send({ tots: 2 });
  // });



  app.use((req, res, next) => {
    const shop = Shopify.Utils.sanitizeShop(req.query.shop);
    if (Shopify.Context.IS_EMBEDDED_APP && shop) {
      res.setHeader(
        "Content-Security-Policy",
        `frame-ancestors https://${encodeURIComponent(
          shop
        )} https://admin.shopify.com;`
      );
    } else {
      res.setHeader("Content-Security-Policy", `frame-ancestors 'none';`);
    }
    next();
  });

  if (isProd) {
    const compression = await import("compression").then(
      ({ default: fn }) => fn
    );
    const serveStatic = await import("serve-static").then(
      ({ default: fn }) => fn
    );
    app.use(compression());
    app.use(serveStatic(PROD_INDEX_PATH, { index: false }));
  }

  app.use("/*", async (req, res, next) => {
    if (typeof req.query.shop !== "string") {
      res.status(500);
      return res.send("No shop provided");
    }

    const shop = Shopify.Utils.sanitizeShop(req.query.shop);
    const appInstalled = await AppInstallations.includes(shop);

    if (!appInstalled && !req.originalUrl.match(/^\/exitiframe/i)) {
      return redirectToAuth(req, res, app);
    }

    if (Shopify.Context.IS_EMBEDDED_APP && req.query.embedded !== "1") {
      const embeddedUrl = Shopify.Utils.getEmbeddedAppUrl(req);

      return res.redirect(embeddedUrl + req.path);
    }

    const htmlFile = join(
      isProd ? PROD_INDEX_PATH : DEV_INDEX_PATH,
      "index.html"
    );

    return res
      .status(200)
      .set("Content-Type", "text/html")
      .send(readFileSync(htmlFile));
  });

  return { app };
}

createServer().then(({ app }) => app.listen(PORT));
