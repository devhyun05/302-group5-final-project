from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess


REPO_ROOT = Path(__file__).resolve().parents[3]


def test_hair_cloudformation_matches_backend_runtime_contract() -> None:
  template = (REPO_ROOT / "infra" / "hair-simulation.yaml").read_text(encoding="utf-8")

  assert "DatabaseUrlSecretValueFrom:" in template
  assert "DatabaseSecretIdSecretValueFrom:" in template
  assert "DatabaseCredentialSecretArn:" in template
  assert "Action: secretsmanager:GetSecretValue" in template
  assert "Name: HAIR_JOBS_QUEUE_URL" in template
  assert "Command: [\"python\", \"-m\", \"app.workers.hair_simulation\"]" in template
  assert "AssignPublicIp: !Ref AssignPublicIp" in template
  assert "PrivateSubnetIds" not in template


def test_hair_provisioning_workflow_is_explicit_and_non_automatic() -> None:
  workflow = (REPO_ROOT / ".github" / "workflows" / "provision-hair-worker.yml").read_text(
    encoding="utf-8",
  )

  assert "workflow_dispatch:" in workflow
  assert "push:" not in workflow
  assert "deploy-hair-worker" in workflow
  assert "environment: dev" in workflow
  assert "scripts/aws/deploy-hair-worker.sh" in workflow

  backend_deploy = (
    REPO_ROOT / ".github" / "workflows" / "deploy-backend-ecs.yml"
  ).read_text(encoding="utf-8")
  assert "HAIR_STACK_NAME:" in backend_deploy
  assert "Resolve hair worker deployment" in backend_deploy
  assert "Connect hair queue to API task definition" in backend_deploy
  assert '"name": "HAIR_JOBS_QUEUE_URL"' in backend_deploy


def test_deploy_hair_worker_reuses_api_contract_and_injects_queue(tmp_path: Path) -> None:
  mock_bin = tmp_path / "bin"
  mock_bin.mkdir()
  call_log = tmp_path / "aws-calls.log"
  registered_task = tmp_path / "registered-task.json"
  mock_aws = mock_bin / "aws"
  mock_aws.write_text(
    """#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$AWS_CALL_LOG"

case "$1 $2" in
  "ecs describe-services")
    if [[ "$*" == *"aura-hair-worker"* ]]; then
      printf '1\\t1\\n'
    else
      printf '%s\\n' '{"services":[{"status":"ACTIVE","taskDefinition":"arn:aws:ecs:region:account:task-definition/aura-backend-api:60","networkConfiguration":{"awsvpcConfiguration":{"subnets":["subnet-a","subnet-b"],"securityGroups":["sg-a"],"assignPublicIp":"ENABLED"}}}]}'
    fi
    ;;
  "ecs describe-task-definition")
    printf '%s\\n' '{"family":"aura-backend-api","networkMode":"awsvpc","requiresCompatibilities":["FARGATE"],"cpu":"1024","memory":"2048","executionRoleArn":"arn:aws:iam::account:role/execution-role","taskRoleArn":"arn:aws:iam::account:role/api-task-role","runtimePlatform":{"cpuArchitecture":"X86_64","operatingSystemFamily":"LINUX"},"containerDefinitions":[{"name":"aura-backend-api","image":"account.dkr.ecr.region.amazonaws.com/aura-backend-api:immutable","environment":[{"name":"ENVIRONMENT","value":"dev"},{"name":"S3_BUCKET_NAME","value":"media-bucket"}],"secrets":[{"name":"DATABASE_SECRET_ID","valueFrom":"arn:aws:secretsmanager:region:account:secret:backend:DATABASE_SECRET_ID::"},{"name":"DB_HOST","valueFrom":"arn:aws:secretsmanager:region:account:secret:backend:DB_HOST::"},{"name":"DB_PORT","valueFrom":"arn:aws:secretsmanager:region:account:secret:backend:DB_PORT::"},{"name":"DB_NAME","valueFrom":"arn:aws:secretsmanager:region:account:secret:backend:DB_NAME::"},{"name":"DB_SSLMODE","valueFrom":"arn:aws:secretsmanager:region:account:secret:backend:DB_SSLMODE::"},{"name":"OPENAI_API_KEY","valueFrom":"arn:aws:secretsmanager:region:account:secret:backend:OPENAI_API_KEY::"}]}]}'
    ;;
  "cloudformation deploy")
    ;;
  "cloudformation describe-stacks")
    printf '%s\\n' '[{"OutputKey":"HairJobsQueueUrl","OutputValue":"https://sqs.region.amazonaws.com/account/aura-hair-jobs"},{"OutputKey":"HairWorkerServiceName","OutputValue":"aura-hair-worker"}]'
    ;;
  "ecs register-task-definition")
    input_path=""
    while [ "$#" -gt 0 ]; do
      if [ "$1" = "--cli-input-json" ]; then
        input_path="${2#file://}"
        break
      fi
      shift
    done
    cp "$input_path" "$REGISTERED_TASK_PATH"
    printf '%s\\n' 'arn:aws:ecs:region:account:task-definition/aura-backend-api:61'
    ;;
  "ecs update-service")
    printf '%s\\n' '{}'
    ;;
  "ecs wait")
    ;;
  *)
    printf 'Unexpected AWS command: %s\\n' "$*" >&2
    exit 2
    ;;
esac
""",
    encoding="utf-8",
  )
  mock_aws.chmod(0o755)

  environment = os.environ.copy()
  environment.update(
    {
      "PATH": f"{mock_bin}:{environment['PATH']}",
      "AWS_CALL_LOG": str(call_log),
      "REGISTERED_TASK_PATH": str(registered_task),
      "ECS_CLUSTER": "aura-backend-dev",
      "ECS_SERVICE": "aura-backend-api",
      "HAIR_DATABASE_CREDENTIAL_SECRET_ARN": (
        "arn:aws:secretsmanager:region:account:secret:database-credentials"
      ),
    },
  )

  result = subprocess.run(
    [str(REPO_ROOT / "scripts" / "aws" / "deploy-hair-worker.sh")],
    cwd=REPO_ROOT,
    env=environment,
    capture_output=True,
    text=True,
    check=False,
  )

  assert result.returncode == 0, result.stderr
  task_definition = json.loads(registered_task.read_text(encoding="utf-8"))
  api_container = next(
    item for item in task_definition["containerDefinitions"] if item["name"] == "aura-backend-api"
  )
  queue_values = [
    item["value"]
    for item in api_container["environment"]
    if item["name"] == "HAIR_JOBS_QUEUE_URL"
  ]
  assert queue_values == ["https://sqs.region.amazonaws.com/account/aura-hair-jobs"]

  calls = call_log.read_text(encoding="utf-8")
  assert "cloudformation deploy" in calls
  assert "DatabaseSecretIdSecretValueFrom=" in calls
  assert "DatabaseCredentialSecretArn=" in calls
  assert "ecs update-service" in calls
