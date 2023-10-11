import moment from "moment";
import { AccountCredit } from "types";
import { TransactionHistory } from "types/Transaction";
import {
  ACCOUNT_CREDIT,
  ACCOUNT_IMPORTER_UPLOADS_TABLE_NAME,
  TRANSACTION_HISTORY,
  envTableNames,
} from "../../config";
import { FusionLambda } from "../../constants/3pApp";
import { FUSION_CREDIT_TYPE_ID } from "../../constants/fusion";
import { InvocationType } from "../../enums/lambda";
import connectKnex from "../../helpers/knex/connect";
import { invokeLambda } from "../../helpers/lambda";
import {
  ImportChunk,
  UploadDesign,
  UploadDesignImport,
} from "../../types/UploadDesign";
import {
  getSessionItem,
  sendFusionNotification,
  updateSession,
  updateSessionStatus,
} from "../../util/3pModule";
import buildUpdateExpression from "../../util/buildUpdateExpression";
import { getFusion } from "../../util/fusion";
import { dynamodb } from "../db";

type CompleteSessionEvent = {
  sessionSlug: string;
  accountId: string;
  responses: Record<string, unknown>;
};

export const completeFusionSession = async (event: CompleteSessionEvent) => {
  // console.time("complete-automation-session");
  // console.log("complete-automation-session: ", JSON.stringify(event, null, 2));
  const { sessionSlug, accountId, responses } = event;

  //Get The Session Data
  const session = await getSessionItem(sessionSlug, accountId);
  // console.log("Session Data: ", JSON.stringify(session, null, 2));

  //Check If Charts Type
  const fusionType = session.session_data.fusion_type;
  const userId = session.session_data.user_id;
  const fusionSlug = session.fusion_slug;
  const totalCreditsUsed = session.session_data.total_credits_used;
  const accountPackageId = session.session_data.account_package_id;
  // console.log({ fusionType });
  const finalPayload: unknown = {};

  if (fusionType === "import") {
    const importChunk = session.session_data.import_chunk;
    // console.log(
    //   "🚀 ~ file: completeFusionSession.ts:41 ~ completeFusionSession ~ importChunk:",
    //   importChunk
    // );
    if (importChunk) {
      const fusion = await getFusion(session.fusion_slug, accountId);
      const importType = fusion?.meta_data?.import_type as UploadDesign["type"];
      // console.log(
      //   "🚀 ~ file: completeFusionSession.ts:44 ~ completeFusionSession ~ importType:",
      //   importType
      // );

      if (importType !== "csv") {
        const { Attributes } = await dynamodb.update({
          TableName: envTableNames.DYNAMODB_ACCT_FUSIONS_QUEUE,
          Key: {
            id: importChunk.id,
            slug: importChunk.slug,
          },
          UpdateExpression:
            "SET #processed_records = #processed_records + :inc, #status = :status, #updated_at = :updated_at",
          ExpressionAttributeNames: {
            "#processed_records": "processed_records",
            "#updated_at": "updated_at",
            "#status": "chunk_status",
          },
          ExpressionAttributeValues: {
            ":inc": 1,
            ":updated_at": new Date().toISOString(),
            ":status": "Complete",
          },
          ReturnValues: "ALL_NEW",
        });

        const importSlug = Attributes?.parent_slug as string;

        const importRes = await dynamodb.update({
          TableName: envTableNames.DYNAMODB_ACCT_IMPORTER_UPLOADS,
          Key: {
            id: ACCOUNT_IMPORTER_UPLOADS_TABLE_NAME,
            slug: importSlug,
          },
          UpdateExpression:
            "SET #processed_records = #processed_records + :inc, #status = :status, #updated_at = :updated_at",
          ExpressionAttributeNames: {
            "#processed_records": "processed_records",
            "#updated_at": "updated_at",
            "#status": "status",
          },
          ExpressionAttributeValues: {
            ":inc": 1,
            ":updated_at": new Date().toISOString(),
            ":status": "Complete",
          },
          ReturnValues: "ALL_NEW",
        });

        await sendFusionNotification({
          ...session,
          is_import_session: true,
          session_data: {
            ...session.session_data,
            payload: importRes.Attributes,
          },
        });
      } else {
        const chunkRes = await dynamodb.update({
          TableName: envTableNames.DYNAMODB_ACCT_FUSIONS_QUEUE,
          Key: {
            id: importChunk.id,
            slug: importChunk.slug,
          },
          UpdateExpression:
            "SET #processed_records = #processed_records + :inc, #updated_at = :updated_at",
          ExpressionAttributeNames: {
            "#processed_records": "processed_records",
            "#updated_at": "updated_at",
          },
          ExpressionAttributeValues: {
            ":inc": 1,
            ":updated_at": new Date().toISOString(),
          },
          ReturnValues: "ALL_NEW",
        });

        const updatedChunk = chunkRes.Attributes as ImportChunk;
        // console.log(
        //   "🚀 ~ file: completeFusionSession.ts:127 ~ completeFusionSession ~ updatedChunk:",
        //   updatedChunk
        // );

        const importRes = await dynamodb.update({
          TableName: envTableNames.DYNAMODB_ACCT_IMPORTER_UPLOADS,
          Key: {
            id: ACCOUNT_IMPORTER_UPLOADS_TABLE_NAME,
            slug: updatedChunk.parent_slug,
          },
          UpdateExpression:
            "SET #processed_records = #processed_records + :inc, #updated_at = :updated_at",
          ExpressionAttributeNames: {
            "#processed_records": "processed_records",
            "#updated_at": "updated_at",
          },
          ExpressionAttributeValues: {
            ":inc": 1,
            ":updated_at": new Date().toISOString(),
          },
          ReturnValues: "ALL_NEW",
        });

        let importUpload = importRes.Attributes as UploadDesignImport;
        // console.log(
        //   "🚀 ~ file: completeFusionSession.ts:169 ~ completeFusionSession ~ importUpload:",
        //   importUpload
        // );

        if (
          updatedChunk.processed_records >=
          (updatedChunk.chunk_data as Record<string, string>[]).length
        ) {
          await dynamodb.update({
            TableName: envTableNames.DYNAMODB_ACCT_FUSIONS_QUEUE,
            Key: {
              id: importChunk.id,
              slug: importChunk.slug,
            },
            UpdateExpression:
              "SET #status = :status, #updated_at = :updated_at",
            ExpressionAttributeNames: {
              "#status": "chunk_status",
              "#updated_at": "updated_at",
            },
            ExpressionAttributeValues: {
              ":status": "Complete",
              ":updated_at": new Date().toISOString(),
            },
          });

          if (importUpload.processed_records >= importUpload.records_count) {
            const { Attributes } = await dynamodb.update({
              TableName: envTableNames.DYNAMODB_ACCT_IMPORTER_UPLOADS,
              Key: {
                id: ACCOUNT_IMPORTER_UPLOADS_TABLE_NAME,
                slug: updatedChunk.parent_slug,
              },
              UpdateExpression:
                "SET #status = :status, #updated_at = :updated_at",
              ExpressionAttributeNames: {
                "#status": "status",
                "#updated_at": "updated_at",
              },
              ExpressionAttributeValues: {
                ":status": "Complete",
                ":updated_at": new Date().toISOString(),
              },
              ReturnValues: "ALL_NEW",
            });

            importUpload = Attributes as UploadDesignImport;
          } else {
            const { Items = [] } = await dynamodb.query({
              TableName: envTableNames.DYNAMODB_ACCT_FUSIONS_QUEUE,
              IndexName: "chunk_status_gsi",
              KeyConditionExpression: "#id = :id AND begins_with(#slug, :slug)",
              ExpressionAttributeNames: {
                "#id": "chunk_status",
                "#slug": "slug",
              },
              ExpressionAttributeValues: {
                ":id": "Pending",
                ":slug": `${accountId}:${updatedChunk.parent_slug}`,
              },
              Limit: 1,
            });

            const nextChunk = Items[0] as ImportChunk;

            const { Attributes: updatedNextChunk } = await dynamodb.update(
              buildUpdateExpression({
                tableName: envTableNames.DYNAMODB_ACCT_FUSIONS_QUEUE,
                keys: {
                  id: nextChunk.id,
                  slug: nextChunk.slug,
                },
                item: {
                  chunk_status: "Processing",
                },
                ReturnValues: "ALL_NEW",
              })
            );

            const fusion = await getFusion(
              nextChunk.target_fusion,
              nextChunk.account_id
            );

            for (const [idx, chunk] of (
              (updatedNextChunk?.chunk_data || []) as Record<string, string>[]
            ).entries()) {
              await invokeLambda(
                FusionLambda.SessionInt,
                {
                  fusionSlug: nextChunk.target_fusion,
                  popupVariables: { popup_variables: { data: chunk } },
                  userId: nextChunk.user_id,
                  fusion,
                  accountId: nextChunk.account_id,
                  importChunk: updatedNextChunk,
                  chunkIndex: idx,
                },
                InvocationType.Event,
                { roundRobin: true }
              );
            }
          }
        }

        await sendFusionNotification({
          ...session,
          is_import_session: true,
          session_data: {
            ...session.session_data,
            payload: importUpload,
          },
        });
      }
    }
  }

  await updateSessionStatus(sessionSlug, "Complete", accountId, finalPayload);
  await updateSession(
    accountId,
    sessionSlug,
    "SET session_data.#finish_time = :finish_time",
    {
      ":finish_time": moment.utc().format(),
    },
    {
      "#finish_time": "finish_time",
    }
  );

  const incrementFuncOperators = session.session_data.session_operators.filter(
    (op) =>
      op.app_module === "increment_function" &&
      ["scenario", "cycle"].includes(`${op.operator_input_settings?.reset}`)
  );

  for (const operator of incrementFuncOperators) {
    await dynamodb.update({
      TableName: envTableNames.DYNAMODB_ACCT_FUSIONS,
      Key: {
        id: `${accountId}:fusions`,
        slug: fusionSlug,
      },
      UpdateExpression: "SET #incrementFunctions.#operatorSlug.#value = :value",
      ExpressionAttributeNames: {
        "#incrementFunctions": "increment_functions",
        "#operatorSlug": operator.operator_slug!,
        "#value": "i",
      },
      ExpressionAttributeValues: {
        ":value": 0,
      },
    });
  }

  const connectionKnex = await connectKnex(session.session_data.aurora_db_name);

  console.log("deducting credits from account", totalCreditsUsed);
  const returnData = await connectionKnex<AccountCredit>(ACCOUNT_CREDIT)
    .decrement("credits_in_progress", totalCreditsUsed)
    .decrement("credits_available", totalCreditsUsed)
    .where("credit_type_id", FUSION_CREDIT_TYPE_ID)
    .returning("*");

  console.log(
    "deducting credits from account done!",
    JSON.stringify(returnData, null, 2)
  );

  console.log(
    "creating transaction history record",
    accountPackageId,
    FUSION_CREDIT_TYPE_ID,
    totalCreditsUsed
  );
  const transData = await connectionKnex<TransactionHistory>(
    TRANSACTION_HISTORY
  )
    .insert({
      title: "fusion credit used fusion_name",
      credit_type_id: `${accountPackageId}:${FUSION_CREDIT_TYPE_ID}`,
      package_id: accountPackageId,
      debited: totalCreditsUsed,
    })
    .returning("*");
  console.log(
    "creating transaction history record done!",
    JSON.stringify(transData, null, 2)
  );

  // console.timeEnd("complete-automation-session");
  // console.log("Memory: ", process.memoryUsage());
  return;
};

export default completeFusionSession;
