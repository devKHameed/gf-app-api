import ThreePAppFunctions from "./central/3pApp";
import ThreePAppActionFunctions from "./central/3pAppAction";
import ThreePAppConnectionFunctions from "./central/3pAppConnection";
import ThreePAppGFMLFunctions from "./central/3pAppGFMLFunction";
import ThreePAppRPFunctions from "./central/3pAppRP";
import ThreePAppWebhookFunctions from "./central/3pAppWebhook";
import JobSessionFunctions from "./central/JobSession";
import AccountFunctions from "./central/account";
import { MAINPOOLS } from "./common";
// import AccountTypeFunctions from "./central/accountType";
import AccountUserTypeFunctions from "./central/accountUserType";
// import ActionItemFunctions from "./central/actionItem";
// import ActionItemTypeFunctions from "./central/actionItemType";
// import AffiliateProgramFunctions from "./central/affiliateProgram";
import APPConfigFunctions from "./central/appConfig";
import AuroraFunctions from "./central/aurora";
import BillingTransation from "./central/billingHistory";
import CardLambdaFunctions from "./central/card";
// import chatFunctions from "./central/chat";
// import ChatListFunctions from "./central/chatList";
// import ChatMessageFunctions from "./central/chatMessage";
// import ChatQueueFunctions from "./central/chatQueue";
// import ChatWidgetFunctions from "./central/chatWidget";
// import ContactFunctions from "./central/contact";
// import ContactListFunctions from "./central/contactList";
// import ContactTagFunctions from "./central/contactTag";
// import ContactTypeFunctions from "./central/contactType";
import CreditTypeFunctions from "./central/creditType";
import CentralCronFunctions from "./central/cron";
// import CsvImportsFunctions from "./central/csvImports";
// import DatacardFunctions from "./central/datacard";
// import DatacardDesignFunctions from "./central/datacardDesign";
// import DatacardHistoryFunctions from "./central/datacardHistory";
import DatasetFunctions from "./central/dataset";
import DatasetDesignFunctions from "./central/datasetDesign";
// import DBStreamFunctions from "./central/dbstream";
// import DigitalProductFunctions from "./central/digitalProduct";
// import DocumentFunctions from "./central/document";
// import DocumentDesignFunctions from "./central/documentDesign";
import EventFunctions from "./central/event";
import FineTubeKnowledgebaseSlideFunctions from "./central/fineTuneKnowledgebase";
import FineTuneKnowledgebaseTopicFunctions from "./central/fineTuneKnowledgebaseTopic";
import FolderFunctions from "./central/folder";
import FusionFunctions from "./central/fusion";
import FusionConnectionFunctions from "./central/fusionConnection";
import FusionFlowFunctions from "./central/fusionFlow";
import FusionFlowHistoryFunctions from "./central/fusionFlowHistory";
import FusionHistoryFunctions from "./central/fusionHistory";
import FusionSessionFunctions from "./central/fusionSession";
import FusionSetFunctions from "./central/fusionSet";
import FusionWebhookFunctions from "./central/fusionWebhook";
import GFAppsFunctions from "./central/gfApp";
// import GFContactsFunctions from "./central/gfContact";
import GFGuiFunctions from "./central/gfGui";
// import GFGuiPluginFunctions from "./central/gfGuiPlugin";
// import GFWidgetPluginFunctions from "./central/gfWidgetPlugin";
// import GFWorkflowFunctions from "./central/gfWorkflow";
// import GFWorkflowSessionFunctions from "./central/gfWorkflowSession";
// import GFWorkflowStageFunctions from "./central/gfWorkflowStage";
import GlobalGFMLFunction from "./central/globalGFMLFunction";
import GuiFunction from "./central/gui";
import GuiDashboardWidgetFunctions from "./central/guiDashboardWidget";
// import GuiViewFunction from "./central/guiView";
// import GuiViewUserFunction from "./central/guiViewUser";
// import GuiViewUserTypeFunction from "./central/guiViewUserType";
import IconFunctions from "./central/icon";
// import KnowledgeBaseFunctions from "./central/knowledgeBase";
import MediaFunctions from "./central/media";
// import MembershipOptionFunctions from "./central/membershipOption";
// import MembershipSettingFunctions from "./central/membershipSetting";
// import OrganizationsFunctions from "./central/organization";
// import OrganizationTypesFunctions from "./central/organizationType";
import PackageFunctions from "./central/package";
// import PortalFunctions from "./central/portal";
// import PortalUserTypeFunctions from "./central/portalUserType";
import PresentationFunctions from "./central/presentation";
import PresentationSlideFunctions from "./central/presentationSlide";
// import ProjectFunctions from "./central/project";
// import ProjectEventFunctions from "./central/projectEvent";
// import ProjectTagFunctions from "./central/projectTag";
// import ProjectTaskTypeFunctions from "./central/projectTaskType";
// import ProjectTypeFunctions from "./central/projectType";
// import ProjectUpdateFunctions from "./central/projectUpdate";
// import PublicCampaignFunctions from "./central/publicCampaign";
// import PublicCampaignExeFunctions from "./central/publicCampaignExe";
import ScriptFunctions from "./central/scripts";
import SeatTypeFunctions from "./central/seatType";
import SignupFunctions from "./central/signup";
import SkillDataFunctions from "./central/skillData";
import SkillIntentFunctions from "./central/skillIntent";
import SkillSessionFunctions from "./central/skillSession";
import SlyarFunctions from "./central/slyar";
// import SocTaskFunctions from "./central/socTask";
// import TaskFunctions from "./central/task";
// import ThemeFunctions from "./central/theme";
// import ThemeElementFunctions from "./central/themeElement";
// import ThemeElementTemplateFunctions from "./central/themeElementTemplate";
import UniversalEventFunctions from "./central/universalEvent";
import UniversalNoteFunctions from "./central/universalNote";
import UniversalTagFunctions from "./central/universalTag";
import UploadFunctions from "./central/upload";
import UploadDesignFunctions from "./central/uploadDesign";
// import UsageTokenFunctions from "./central/usageToken";
import UserFunctions from "./central/user";
import UserActivityFunctions from "./central/userActivity";
// import UserGmailAccountFunctions from "./central/userGmailAccount";
// import UserGmailEmailFunctions from "./central/userGmailEmail";
import UserMenuFunctions from "./central/userMenu";
// import UserPermissionGroupFunctions from "./central/userPermissionGroup";
import VectorKnowledgebaseSlideFunctions from "./central/vectorKnowledgebase";
import VectorKnowledgebaseTopicFunctions from "./central/vectorKnowledgebaseTopic";
// import WebsiteFunctions from "./central/website";
// import WebsiteEventRuleFunctions from "./central/websiteEventRule";
// import WebsitePageFunctions from "./central/websitePage";
// import WebsiteWidgetFunctions from "./central/websiteWidget";
import GuiPramsFunctions from "./central/guiPrams";
import WebsocketFunctions from "./central/websocket";
import CronFunctions from "./fusion/cron";
import FlowRunnerLambdaFunctions from "./fusion/flowRunner";
import FusionLambdaFunctions from "./fusion/fusionLambda";

const lambdaFunctions = {
  fusion: {
    ...FlowRunnerLambdaFunctions,
    ...FusionLambdaFunctions,
    ...CronFunctions,
  },
  main: {
    [MAINPOOLS.USER_MNG]: {
      ...UserFunctions,
      ...AccountUserTypeFunctions,
      ...PackageFunctions,
      ...CreditTypeFunctions,
      ...SeatTypeFunctions,
      ...BillingTransation,
      ...UserMenuFunctions,
    },
    [MAINPOOLS.DEV_SETT]: {
      ...GlobalGFMLFunction,
      ...ThreePAppFunctions,
      ...ThreePAppConnectionFunctions,
      ...ThreePAppActionFunctions,
      ...ThreePAppRPFunctions,
      ...ThreePAppWebhookFunctions,
      ...ThreePAppGFMLFunctions,
    },
    [MAINPOOLS.GUI_FUSION]: {
      ...AccountFunctions,
      ...SkillDataFunctions,
      ...FusionFunctions,
      ...FusionFlowHistoryFunctions,
      ...FusionFlowFunctions,
      ...FusionConnectionFunctions,
      ...FusionHistoryFunctions,
      ...FusionWebhookFunctions,
      ...FusionSessionFunctions,
      ...FusionSetFunctions,
      ...GuiFunction,
      // ...GuiViewUserFunction,
      // ...GuiViewUserTypeFunction,
      // ...GuiViewFunction,
      // ...GFGuiPluginFunctions,
      // ...GFWidgetPluginFunctions,
      ...GFGuiFunctions,
      ...GuiDashboardWidgetFunctions,
      ...UploadDesignFunctions,
    },
    [MAINPOOLS.DATA_MNG]: {
      ...DatasetDesignFunctions,
      ...DatasetFunctions,
    },
    [MAINPOOLS.PUBLIC_1]: {
      // ...ChatListFunctions,
      // ...ChatMessageFunctions,
      // ...chatFunctions,
      // ...CsvImportsFunctions,
      // ...ProjectFunctions,
      // ...ProjectTagFunctions,
      // ...ProjectTypeFunctions,
      // ...ProjectEventFunctions,
      // ...PublicCampaignFunctions,
      // ...PublicCampaignExeFunctions,
      // ...TaskFunctions,
      // ...ProjectUpdateFunctions,
      // ...ChatQueueFunctions,
      // ...ChatWidgetFunctions,
      ...PresentationFunctions,
      ...PresentationSlideFunctions,
      ...VectorKnowledgebaseSlideFunctions,
      ...FineTubeKnowledgebaseSlideFunctions,
      ...VectorKnowledgebaseTopicFunctions,
      ...FineTuneKnowledgebaseTopicFunctions,
      ...SignupFunctions,
      ...GFAppsFunctions,
      ...UploadFunctions,
      ...ScriptFunctions,
      ...CardLambdaFunctions,
      ...EventFunctions,
      ...UserActivityFunctions,
      ...UniversalEventFunctions,
      ...UniversalTagFunctions,
      ...UniversalNoteFunctions,
      ...IconFunctions,
      ...FolderFunctions,
      ...AuroraFunctions,
      ...SlyarFunctions,
      ...SkillIntentFunctions,
      ...SkillSessionFunctions,
      ...JobSessionFunctions,
      ...MediaFunctions,
      ...APPConfigFunctions,
      ...CentralCronFunctions,
      ...GuiPramsFunctions,
    },
    [MAINPOOLS.WEBSOCKET]: WebsocketFunctions,
  } as const,
} as const;

export type MainPools = keyof typeof lambdaFunctions["main"];
export default lambdaFunctions;
