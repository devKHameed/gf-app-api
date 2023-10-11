import { MYSQL2_LAYER, PUBLIC_SUBNET, RDS_ROLE } from "../common";

const functions = {
  addNewMenu: {
    handler: "src/functions/userMenu/addNewMenu.handler",
    events: [
      {
        httpApi: {
          path: "/user-menu",
          method: "post",
        },
      },
    ],
    vpc: PUBLIC_SUBNET,
    role: RDS_ROLE,
    layers: [MYSQL2_LAYER],
  },
  listMenu: {
    handler: "src/functions/userMenu/listMenu.handler",
    events: [
      {
        httpApi: {
          path: "/user-menu",
          method: "get",
        },
      },
    ],
    vpc: PUBLIC_SUBNET,
    role: RDS_ROLE,
    layers: [MYSQL2_LAYER],
  },
  updateMenu: {
    handler: "src/functions/userMenu/updateMenu.handler",
    events: [
      {
        httpApi: {
          path: "/user-menu/{id}",
          method: "put",
        },
      },
    ],
    vpc: PUBLIC_SUBNET,
    role: RDS_ROLE,
    layers: [MYSQL2_LAYER],
  },
  sortMenu: {
    handler: "src/functions/userMenu/sortMenu.handler",
    events: [
      {
        httpApi: {
          path: "/user-menu/sort",
          method: "put",
        },
      },
    ],
    vpc: PUBLIC_SUBNET,
    role: RDS_ROLE,
    layers: [MYSQL2_LAYER],
  },
  addNewMenuTemplate: {
    handler: "src/functions/userMenu/addNewMenuTemplate.handler",
    events: [
      {
        httpApi: {
          path: "/user-menu-template",
          method: "post",
        },
      },
    ],
    vpc: PUBLIC_SUBNET,
    role: RDS_ROLE,
    layers: [MYSQL2_LAYER],
  },
  listMenuTemplate: {
    handler: "src/functions/userMenu/listMenuTemplate.handler",
    events: [
      {
        httpApi: {
          path: "/user-menu-template",
          method: "get",
        },
      },
    ],
    vpc: PUBLIC_SUBNET,
    role: RDS_ROLE,
    layers: [MYSQL2_LAYER],
  },
  getUserMenu: {
    handler: "src/functions/userMenu/getUserMenu.handler",
    events: [
      {
        httpApi: {
          path: "/user-menu/current",
          method: "get",
        },
      },
    ],
    vpc: PUBLIC_SUBNET,
    role: RDS_ROLE,
    layers: [MYSQL2_LAYER],
  },
};
export default functions;
