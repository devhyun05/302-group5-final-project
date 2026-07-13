#!/usr/bin/env bash

set -euo pipefail

AWS_REGION="${AWS_REGION:-ap-northeast-2}"
ECS_CONTAINER_NAME="${ECS_CONTAINER_NAME:-aura-backend-api}"
HAIR_STACK_NAME="${HAIR_STACK_NAME:-aura-hair}"
HAIR_PROJECT_NAME="${HAIR_PROJECT_NAME:-aura-hair}"
HAIR_WORKER_CONTAINER_NAME="${HAIR_WORKER_CONTAINER_NAME:-aura-hair-worker}"
HAIR_STYLE_ASSET_BUCKET_NAME="${HAIR_STYLE_ASSET_BUCKET_NAME:-}"
HAIR_STYLE_ASSET_PREFIX="${HAIR_STYLE_ASSET_PREFIX:-catalog/hair-styles/v1}"
HAIR_DATABASE_CREDENTIAL_SECRET_ARN="${HAIR_DATABASE_CREDENTIAL_SECRET_ARN:-}"

required_commands=(aws jq)
for command_name in "${required_commands[@]}"; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    printf '%s is required.\n' "$command_name" >&2
    exit 1
  fi
done

required_variables=(ECS_CLUSTER ECS_SERVICE)
for variable_name in "${required_variables[@]}"; do
  if [ -z "${!variable_name:-}" ]; then
    printf '%s is required.\n' "$variable_name" >&2
    exit 1
  fi
done

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
template_path="$repo_root/infra/hair-simulation.yaml"
if [ ! -f "$template_path" ]; then
  printf 'CloudFormation template not found: %s\n' "$template_path" >&2
  exit 1
fi

temporary_directory="$(mktemp -d)"
trap 'rm -rf "$temporary_directory"' EXIT

service_json="$temporary_directory/service.json"
task_json="$temporary_directory/task.json"
api_task_definition="$temporary_directory/api-task-definition.json"

aws ecs describe-services \
  --region "$AWS_REGION" \
  --cluster "$ECS_CLUSTER" \
  --services "$ECS_SERVICE" \
  --output json > "$service_json"

service_status="$(jq -r '.services[0].status // empty' "$service_json")"
task_definition_arn="$(jq -r '.services[0].taskDefinition // empty' "$service_json")"
if [ "$service_status" != "ACTIVE" ] || [ -z "$task_definition_arn" ]; then
  printf 'ECS service %s/%s is not active.\n' "$ECS_CLUSTER" "$ECS_SERVICE" >&2
  exit 1
fi

aws ecs describe-task-definition \
  --region "$AWS_REGION" \
  --task-definition "$task_definition_arn" \
  --query taskDefinition \
  --output json > "$task_json"

container_count="$(jq --arg name "$ECS_CONTAINER_NAME" '[.containerDefinitions[] | select(.name == $name)] | length' "$task_json")"
if [ "$container_count" != "1" ]; then
  printf 'Container %s was not found exactly once in %s.\n' "$ECS_CONTAINER_NAME" "$task_definition_arn" >&2
  exit 1
fi

environment_value() {
  local name="$1"
  jq -r --arg container "$ECS_CONTAINER_NAME" --arg name "$name" '
    first(
      .containerDefinitions[]
      | select(.name == $container)
      | (.environment // [])[]
      | select(.name == $name)
      | .value
    ) // empty
  ' "$task_json"
}

secret_value_from() {
  local name="$1"
  jq -r --arg container "$ECS_CONTAINER_NAME" --arg name "$name" '
    first(
      .containerDefinitions[]
      | select(.name == $container)
      | (.secrets // [])[]
      | select(.name == $name)
      | .valueFrom
    ) // empty
  ' "$task_json"
}

container_image="$(jq -r --arg name "$ECS_CONTAINER_NAME" '.containerDefinitions[] | select(.name == $name) | .image' "$task_json")"
execution_role_arn="$(jq -r '.executionRoleArn // empty' "$task_json")"
api_task_role_arn="$(jq -r '.taskRoleArn // empty' "$task_json")"
api_task_role_name="${api_task_role_arn##*/}"
cpu_architecture="$(jq -r '.runtimePlatform.cpuArchitecture // "X86_64"' "$task_json")"
data_bucket_name="$(environment_value S3_BUCKET_NAME)"
environment_name="$(environment_value ENVIRONMENT)"
environment_name="${environment_name:-dev}"

database_url_secret="$(secret_value_from DATABASE_URL)"
database_secret_id_secret="$(secret_value_from DATABASE_SECRET_ID)"
db_host_secret="$(secret_value_from DB_HOST)"
db_port_secret="$(secret_value_from DB_PORT)"
db_name_secret="$(secret_value_from DB_NAME)"
db_sslmode_secret="$(secret_value_from DB_SSLMODE)"
openai_secret="$(secret_value_from OPENAI_API_KEY)"

subnets="$(jq -r '.services[0].networkConfiguration.awsvpcConfiguration.subnets // [] | join(",")' "$service_json")"
security_groups="$(jq -r '.services[0].networkConfiguration.awsvpcConfiguration.securityGroups // [] | join(",")' "$service_json")"
assign_public_ip="$(jq -r '.services[0].networkConfiguration.awsvpcConfiguration.assignPublicIp // "DISABLED"' "$service_json")"

if [ -z "$container_image" ] || [ -z "$execution_role_arn" ] || [ -z "$api_task_role_name" ]; then
  printf 'The API task definition is missing its image, execution role, or task role.\n' >&2
  exit 1
fi
if [ -z "$data_bucket_name" ] || [ -z "$openai_secret" ]; then
  printf 'The API task definition must provide S3_BUCKET_NAME and OPENAI_API_KEY.\n' >&2
  exit 1
fi
if [ -z "$subnets" ] || [ -z "$security_groups" ]; then
  printf 'The API service must use awsvpc subnets and security groups.\n' >&2
  exit 1
fi
if [ -z "$database_url_secret" ] && [ -z "$database_secret_id_secret" ]; then
  printf 'The API task definition must provide DATABASE_URL or DATABASE_SECRET_ID as an ECS secret.\n' >&2
  exit 1
fi
if [ -n "$database_secret_id_secret" ] && [ -z "$HAIR_DATABASE_CREDENTIAL_SECRET_ARN" ]; then
  printf 'HAIR_DATABASE_CREDENTIAL_SECRET_ARN is required when DATABASE_SECRET_ID is used.\n' >&2
  exit 1
fi

parameter_overrides=(
  "ProjectName=$HAIR_PROJECT_NAME"
  "ClusterName=$ECS_CLUSTER"
  "EnvironmentName=$environment_name"
  "ContainerImage=$container_image"
  "WorkerContainerName=$HAIR_WORKER_CONTAINER_NAME"
  "ExecutionRoleArn=$execution_role_arn"
  "ApiTaskRoleName=$api_task_role_name"
  "WorkerSubnetIds=$subnets"
  "WorkerSecurityGroupIds=$security_groups"
  "AssignPublicIp=$assign_public_ip"
  "DataBucketName=$data_bucket_name"
  "HairStyleAssetPrefix=$HAIR_STYLE_ASSET_PREFIX"
  "OpenAISecretValueFrom=$openai_secret"
  "CpuArchitecture=$cpu_architecture"
)

append_parameter() {
  local name="$1"
  local value="$2"
  if [ -n "$value" ]; then
    parameter_overrides+=("$name=$value")
  fi
}

append_parameter HairStyleAssetBucketName "$HAIR_STYLE_ASSET_BUCKET_NAME"
append_parameter DatabaseUrlSecretValueFrom "$database_url_secret"
append_parameter DatabaseSecretIdSecretValueFrom "$database_secret_id_secret"
append_parameter DbHostSecretValueFrom "$db_host_secret"
append_parameter DbPortSecretValueFrom "$db_port_secret"
append_parameter DbNameSecretValueFrom "$db_name_secret"
append_parameter DbSslmodeSecretValueFrom "$db_sslmode_secret"
append_parameter DatabaseCredentialSecretArn "$HAIR_DATABASE_CREDENTIAL_SECRET_ARN"

aws cloudformation deploy \
  --region "$AWS_REGION" \
  --stack-name "$HAIR_STACK_NAME" \
  --template-file "$template_path" \
  --capabilities CAPABILITY_NAMED_IAM \
  --no-fail-on-empty-changeset \
  --parameter-overrides "${parameter_overrides[@]}"

stack_outputs="$(aws cloudformation describe-stacks \
  --region "$AWS_REGION" \
  --stack-name "$HAIR_STACK_NAME" \
  --query 'Stacks[0].Outputs' \
  --output json)"

queue_url="$(jq -r '.[] | select(.OutputKey == "HairJobsQueueUrl") | .OutputValue' <<<"$stack_outputs")"
worker_service="$(jq -r '.[] | select(.OutputKey == "HairWorkerServiceName") | .OutputValue' <<<"$stack_outputs")"
if [ -z "$queue_url" ] || [ -z "$worker_service" ]; then
  printf 'The hair stack did not return its queue URL and worker service.\n' >&2
  exit 1
fi

jq --arg container "$ECS_CONTAINER_NAME" --arg queue_url "$queue_url" '
  del(
    .taskDefinitionArn,
    .revision,
    .status,
    .requiresAttributes,
    .compatibilities,
    .registeredAt,
    .registeredBy
  )
  | .containerDefinitions |= map(
      if .name == $container then
        .environment = (
          ((.environment // []) | map(select(.name != "HAIR_JOBS_QUEUE_URL")))
          + [{"name": "HAIR_JOBS_QUEUE_URL", "value": $queue_url}]
        )
      else . end
    )
' "$task_json" > "$api_task_definition"

new_task_definition_arn="$(aws ecs register-task-definition \
  --region "$AWS_REGION" \
  --cli-input-json "file://$api_task_definition" \
  --query 'taskDefinition.taskDefinitionArn' \
  --output text)"

aws ecs update-service \
  --region "$AWS_REGION" \
  --cluster "$ECS_CLUSTER" \
  --service "$ECS_SERVICE" \
  --task-definition "$new_task_definition_arn" \
  --force-new-deployment \
  --output json >/dev/null

aws ecs wait services-stable \
  --region "$AWS_REGION" \
  --cluster "$ECS_CLUSTER" \
  --services "$ECS_SERVICE" "$worker_service"

worker_counts="$(aws ecs describe-services \
  --region "$AWS_REGION" \
  --cluster "$ECS_CLUSTER" \
  --services "$worker_service" \
  --query 'services[0].[desiredCount,runningCount]' \
  --output text)"
worker_desired="$(awk '{print $1}' <<<"$worker_counts")"
worker_running="$(awk '{print $2}' <<<"$worker_counts")"
if [ -z "$worker_desired" ] || [ "$worker_running" -lt "$worker_desired" ]; then
  printf 'Hair worker is not stable: desired=%s running=%s\n' "$worker_desired" "$worker_running" >&2
  exit 1
fi

printf 'Hair worker deployment is stable. stack=%s service=%s apiTask=%s\n' \
  "$HAIR_STACK_NAME" "$worker_service" "$new_task_definition_arn"
