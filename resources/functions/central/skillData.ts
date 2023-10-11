import { MYSQL2_LAYER, PRIVATE_SUBNET, RDS_ROLE } from "../common";

const functions = {
  createSkillData: {
    handler: "src/functions/skillData/createSkillData.handler",
    events: [
      {
        httpApi: {
          path: "/skill-data",
          method: "post",
        },
      },
    ],
  },
  getSkillData: {
    handler: "src/functions/skillData/getSkillData.handler",
    events: [
      {
        httpApi: {
          path: "/skill-data/{slug}",
          method: "get",
        },
      },
    ],
  },
  updateSkillData: {
    handler: "src/functions/skillData/updateSkillData.handler",
    events: [
      {
        httpApi: {
          path: "/skill-data/{slug}",
          method: "put",
        },
      },
    ],
  },
  removeSkillData: {
    handler: "src/functions/skillData/removeSkillData.handler",
    events: [
      {
        httpApi: {
          path: "/skill-data/{slug}",
          method: "delete",
        },
      },
    ],
  },
  listSkillData: {
    handler: "src/functions/skillData/listSkillData.handler",
    events: [
      {
        httpApi: {
          path: "/skill-data",
          method: "get",
        },
      },
    ],
  },
  checkIsSlugValid: {
    handler: "src/functions/skillData/checkIsSlugValid.handler",
    events: [
      {
        httpApi: {
          path: "/skill-data/check-is-slug-valid",
          method: "post",
        },
      },
    ],
  },
};
export default Object.entries(functions).reduce<Record<string, unknown>>(
  (acc, [key, value]) => {
    acc[key] = {
      ...value,
      vpc: PRIVATE_SUBNET,
      role: RDS_ROLE,
      layers: [MYSQL2_LAYER],
    };

    return acc;
  },
  {}
);
