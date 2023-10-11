import EventBridge, {
  PutEventsRequestEntryList,
} from "aws-sdk/clients/eventbridge";
import STS from "aws-sdk/clients/sts";
import {
  ACCT_NAME,
  MAIN_ACCT_ACCESS_ROLE_ARN,
  MAIN_ACCT_ACCESS_ROLE_SESSION_NAME,
  REGION,
} from "../../config";

const stsClient = new STS();
let eventBridgeClient: EventBridge;

const getEventBridgeCredentials = async () => {
  if (!MAIN_ACCT_ACCESS_ROLE_ARN || !MAIN_ACCT_ACCESS_ROLE_SESSION_NAME) {
    throw new Error(
      "MAIN_ACCT_ACCESS_ROLE_ARN and MAIN_ACCT_ACCESS_ROLE_SESSION_NAME must be specified"
    );
  }

  const stsSession = await stsClient
    .assumeRole({
      RoleArn: MAIN_ACCT_ACCESS_ROLE_ARN,
      RoleSessionName: MAIN_ACCT_ACCESS_ROLE_SESSION_NAME,
    })
    .promise();

  if (!stsSession.Credentials) {
    throw new Error(`Could not assume role ${MAIN_ACCT_ACCESS_ROLE_ARN}`);
  }

  return stsSession.Credentials;
};

export const initEventBridgeClient = async () => {
  let eventBridge = new EventBridge();
  // console.log(
  //   "🚀 ~ file: index.ts ~ line 39 ~ initEventBridgeClient ~ ACCT_NAME",
  //   ACCT_NAME
  // );
  if (ACCT_NAME !== "main") {
    const { AccessKeyId, SecretAccessKey, SessionToken } =
      await getEventBridgeCredentials();
    eventBridge = new EventBridge({
      accessKeyId: AccessKeyId,
      secretAccessKey: SecretAccessKey,
      sessionToken: SessionToken,
      region: REGION,
    });
  }

  eventBridgeClient = eventBridge;
  return eventBridge;
};

export const putEvents = async (entries: PutEventsRequestEntryList) => {
  // console.log("Sending Event: ", entries);
  // console.log(
  //   "🚀 ~ file: index.ts ~ line 71 ~ putEvents ~ eventBridgeClient",
  //   eventBridgeClient
  // );
  // if (!eventBridgeClient) {
  // }
  await initEventBridgeClient();
  await eventBridgeClient
    .putEvents({
      Entries: entries,
    })
    .promise()
    .catch((err) => {
      console.log("Error send events to event bridge", err);
    });

  // console.log("��� ~ file: index.ts ~ line 73 ~ putEvents ~ eventBridgeClient");
};
