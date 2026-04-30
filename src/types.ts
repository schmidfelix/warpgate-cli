export type BootstrapColor =
  | "Primary"
  | "Secondary"
  | "Success"
  | "Danger"
  | "Warning"
  | "Info"
  | "Light"
  | "Dark";

export type TargetKind = "Http" | "Kubernetes" | "MySql" | "Ssh" | "Postgres";

export interface GroupInfo {
  id: string;
  name: string;
  color?: BootstrapColor;
}

export interface TargetSnapshot {
  name: string;
  description: string;
  kind: TargetKind;
  external_host?: string;
  group?: GroupInfo;
  default_database_name?: string;
}

export interface PortsInfo {
  ssh?: number;
  http?: number;
  mysql?: number;
  postgres?: number;
  kubernetes?: number;
}

export interface ExternalHostsInfo {
  ssh?: string;
  http?: string;
  mysql?: string;
  postgres?: string;
  kubernetes?: string;
}

export interface Info {
  version?: string;
  username?: string;
  ports: PortsInfo;
  external_host?: string;
  external_hosts?: ExternalHostsInfo;
}
