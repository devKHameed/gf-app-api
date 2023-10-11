import { Knex } from "knex";
import {
  ACCOUNT_CREDIT,
  ACCOUNT_JOB_SESSION_TABLE_NAME,
  ACCOUNT_SKILL_SESSION_TABLE_NAME,
  TRANSACTION_HISTORY,
  USER_MENU_ITEM,
  USER_MENU_TEMPLATE,
} from "../../config";
import connectKnex from "../../helpers/knex/connect";

export const createSchemaAndSwitch = async function (knex: Knex, name: string) {
  return knex.raw(`CREATE DATABASE ${name}`).then(async () => {
    console.log(`Database ${name} created`);

    return await connectKnex(name);
  });
};
export const createSchema = function (knex: Knex, name: string) {
  return knex.schema.createSchema(name);
};
export const dropSchema = function (knex: Knex, name: string) {
  return knex.schema.dropSchemaIfExists(name);
};

export const up = function (knex: Knex) {
  return knex.schema
    .createTable(ACCOUNT_SKILL_SESSION_TABLE_NAME, (table) => {
      table.increments("session_id").primary();
      table.string("account_id").notNullable();
      table.string("user_id").notNullable();
      table.string("skill_id").notNullable();
      table.datetime("start_date_time").notNullable();
      table.datetime("end_date_time").nullable();
      table.enu("status", ["Open", "Closed"]).notNullable();
      table.text("note");
    })
    .createTable(ACCOUNT_JOB_SESSION_TABLE_NAME, (table) => {
      table.increments("session_id").primary();
      table.string("account_id").notNullable();
      table.string("user_id").notNullable();
      table.string("related_skill_id").notNullable();
      table.datetime("start_date_time").notNullable();
      table.datetime("end_date_time").nullable();
      table
        .enu("status", ["Open", "Closed", "Awaiting Instruction", "Cancelled"])
        .notNullable();
      table.string("title").nullable();
      table.text("note");
      table.integer("skill_session_id").unsigned().nullable();
      table
        .foreign("skill_session_id")
        .references("session_id")
        .inTable(ACCOUNT_SKILL_SESSION_TABLE_NAME);
    })
    .createTable(TRANSACTION_HISTORY, (table) => {
      table.increments("id").primary();
      table.string("title");
      table.string("description");
      table.double("credited");
      table.double("debited");
      table.string("credit_type_id");
      table.string("package_id").notNullable();
      table.string("user_id");
      table.string("stripe_transaction_id");
      table.double("stripe_amount");
      table.timestamps(true, true);
    })
    .createTable(ACCOUNT_CREDIT, (table) => {
      table.string("credit_type_id").primary();
      table.double("credits_available");
      table.double("credits_in_progress");
      table.timestamps(true, true);
    })
    .createTable(USER_MENU_TEMPLATE, (table) => {
      table.increments("id").primary();
      table.string("template_name").notNullable();
      table.string("template_slug").notNullable().unique();
      table.boolean("is_custom").notNullable().defaultTo(false);
    })
    .createTable(USER_MENU_ITEM, (table) => {
      table.increments("id").primary();
      table.integer("parent_menu").unsigned();
      table.string("gui_to_link_id").notNullable();
      table.integer("parent_menu_item_id").unsigned();
      table.integer("sort_order").notNullable();
      table.string("label").notNullable();
      table.string("icon");

      table.foreign("parent_menu").references("id").inTable(USER_MENU_TEMPLATE);
      table
        .foreign("parent_menu_item_id")
        .references("id")
        .inTable(USER_MENU_ITEM);
    });
};

export const down = function (knex: Knex) {
  return knex.schema
    .dropTableIfExists(ACCOUNT_JOB_SESSION_TABLE_NAME)
    .dropTableIfExists(ACCOUNT_SKILL_SESSION_TABLE_NAME)
    .dropTableIfExists("media")
    .dropTableIfExists(TRANSACTION_HISTORY)
    .dropTableIfExists(ACCOUNT_CREDIT)
    .dropTableIfExists(USER_MENU_ITEM)
    .dropTableIfExists(USER_MENU_TEMPLATE);
};
