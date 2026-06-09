"""
Generate four AWS architecture diagrams for AfriTalent (account 108188564905, us-east-1).
Source of truth: aws_infrastructure.json (built from Terraform stack at
infra/terraform/accounts/dev-new/).

Run:  .venv/bin/python generate.py
Outputs: aws_architecture.png, aws_security.png, aws_network.png, aws_data_flow.png
"""

from diagrams import Cluster, Diagram, Edge
from diagrams.aws.compute import EC2, ECR, ECS, Fargate, Lambda
from diagrams.aws.database import RDS as RDSProxy
from diagrams.aws.database import Aurora
from diagrams.aws.devtools import Codepipeline
from diagrams.aws.engagement import SES
from diagrams.aws.general import General
from diagrams.aws.integration import StepFunctions
from diagrams.aws.management import (
    Cloudtrail,
    Cloudwatch,
    CloudwatchAlarm,
    Config,
    ParameterStore,
)
from diagrams.aws.network import (
    ALB,
    CloudFront,
    Endpoint,
    InternetGateway,
    Route53,
    VPC,
)
from diagrams.aws.security import (
    WAF,
    IAM,
    KMS,
    SecretsManager,
)
from diagrams.aws.storage import S3
from diagrams.onprem.client import Users
from diagrams.onprem.network import Internet
from diagrams.onprem.vcs import Github
from diagrams.saas.chat import Slack as ExternalSaaS  # stand-in for external SaaS APIs


GRAPH_ATTR = {
    "fontsize": "16",
    "bgcolor": "white",
    "pad": "0.6",
    "splines": "ortho",
}

NODE_ATTR = {"fontsize": "12"}


# ─────────────────────────────────────────────────────────────────────────────
# 1. ARCHITECTURE — overall topology
# ─────────────────────────────────────────────────────────────────────────────
with Diagram(
    "AfriTalent — AWS Architecture (dev / 108188564905 / us-east-1)",
    filename="aws_architecture",
    outformat="png",
    show=False,
    graph_attr=GRAPH_ATTR,
    node_attr=NODE_ATTR,
):
    users = Users("End users\n(candidates, employers)")
    stripe_fw = ExternalSaaS("Stripe / Flutterwave\nwebhooks")
    saas = ExternalSaaS("SaaS APIs\n(Anthropic, OpenAI,\nApify, job boards)")

    cf = CloudFront("CloudFront\nd2j3ahmgbbdup1.cloudfront.net")
    waf = WAF("WAFv2\nrate-limit 2000/5min")

    with Cluster("VPC  10.30.0.0/16  (3 AZs)"):
        igw = InternetGateway("IGW")

        with Cluster("Public subnets  (10.30.0/1/2.0/24)"):
            alb = ALB("ALB\nafritalent-dev-alb")
            nat = EC2("NAT instance\nt4g.nano")

        with Cluster("Private subnets  (10.30.10/11/12.0/24)"):
            with Cluster("ECS cluster: afritalent-dev"):
                frontend = Fargate("frontend\nNext.js 16  :3000\nFargate + Spot")
                backend = Fargate("backend\nExpress 5  :3001\nFargate + Spot")

            with Cluster("Lambda (VPC-attached)"):
                lam_stripe = Lambda("webhook-stripe\nFunction URL")
                lam_fw = Lambda("webhook-flutterwave\nFunction URL")
                lam_orch = Lambda("orchestrator-step")

            sfn = StepFunctions("Step Functions\norchestrator")
            rds_proxy = RDSProxy("RDS Proxy")

        with Cluster("Isolated subnets  (10.30.20/21/22.0/24)"):
            aurora = Aurora("Aurora Serverless v2\nPG 15.5  •  0–4 ACU\nauto-pause 30m")

    s3 = S3("S3 uploads\nresumes / trust / blog")
    ecr = ECR("ECR\nfrontend + backend")
    ses = SES("SES")

    # Public traffic
    users >> Edge(label="HTTPS") >> cf >> Edge(label="WAF") >> waf >> Edge(label="HTTP") >> alb
    alb >> Edge(label="/api/*") >> backend
    alb >> Edge(label="default") >> frontend

    # Webhook traffic (direct to Lambda Function URLs)
    stripe_fw >> Edge(label="HTTPS\nsig verified") >> [lam_stripe, lam_fw]

    # Compute → data
    backend >> rds_proxy >> aurora
    lam_stripe >> rds_proxy
    lam_fw >> rds_proxy
    lam_orch >> rds_proxy

    # Orchestration
    backend >> Edge(label="StartExecution") >> sfn >> lam_orch

    # Egress paths
    backend >> Edge(label="egress", style="dashed") >> nat >> igw
    nat >> Edge(style="dashed") >> saas

    # Storage / images / mail
    backend >> Edge(label="presigned", style="dotted") >> s3
    frontend >> Edge(label="pull image", style="dotted") >> ecr
    backend >> Edge(label="pull image", style="dotted") >> ecr
    backend >> Edge(label="email", style="dotted") >> ses


# ─────────────────────────────────────────────────────────────────────────────
# 2. SECURITY — controls and trust boundaries
# ─────────────────────────────────────────────────────────────────────────────
with Diagram(
    "AfriTalent — Security & Controls",
    filename="aws_security",
    outformat="png",
    show=False,
    graph_attr=GRAPH_ATTR,
    node_attr=NODE_ATTR,
):
    internet = Internet("Public internet")

    with Cluster("Edge controls"):
        waf2 = WAF("WAFv2\nrate-limit 2000/5min")
        cf2 = CloudFront("CloudFront\nTLSv1.2_2021")

    with Cluster("VPC perimeter  10.30.0.0/16"):
        with Cluster("Public tier"):
            alb_s = ALB("ALB\nSG: 80/443 from 0.0.0.0/0")

        with Cluster("Private tier — least privilege SGs"):
            ecs_s = Fargate("ECS tasks\nSG: ports 3000/3001 only from ALB SG")
            lam_s = Lambda("Lambdas\nSG: egress-only")
            proxy_s = RDSProxy("RDS Proxy\nSG: 5432 from ECS+Lambda SGs")

        with Cluster("Isolated tier"):
            aurora_s = Aurora("Aurora\nSG: 5432 from ECS/Lambda/Proxy SGs only\nNo internet route")

    with Cluster("Identity & secrets"):
        iam = IAM("IAM task roles\n+ GitHub OIDC")
        ssm = ParameterStore("SSM SecureString\n/afritalent/dev/*")
        sec = SecretsManager("Secrets Manager\nAurora master")
        kms = KMS("KMS\nSSM + Aurora keys")

    with Cluster("Detective controls"):
        ct = Cloudtrail("CloudTrail")
        cfg = Config("AWS Config")
        cw = Cloudwatch("CloudWatch Logs\n+ dashboards + alarms")

    internet >> Edge(label="HTTPS") >> waf2 >> cf2 >> alb_s >> ecs_s
    ecs_s >> proxy_s >> aurora_s
    lam_s >> proxy_s

    ecs_s >> Edge(label="reads", style="dashed") >> ssm
    lam_s >> Edge(label="reads", style="dashed") >> ssm
    ssm >> Edge(style="dashed") >> kms
    sec >> Edge(style="dashed") >> kms
    proxy_s >> Edge(label="rotates", style="dashed") >> sec
    iam >> Edge(label="grants", style="dotted") >> [ecs_s, lam_s]

    [alb_s, ecs_s, lam_s, aurora_s, proxy_s] >> Edge(style="dotted", color="grey") >> cw
    [iam, ssm, sec, kms] >> Edge(style="dotted", color="grey") >> ct
    [ecs_s, aurora_s] >> Edge(style="dotted", color="grey") >> cfg


# ─────────────────────────────────────────────────────────────────────────────
# 3. NETWORK — topology & connectivity
# ─────────────────────────────────────────────────────────────────────────────
with Diagram(
    "AfriTalent — Network Topology (us-east-1, 3 AZs)",
    filename="aws_network",
    outformat="png",
    show=False,
    graph_attr=GRAPH_ATTR,
    node_attr=NODE_ATTR,
):
    inet = Internet("Internet")

    with Cluster("VPC  vpc-afritalent-dev  10.30.0.0/16"):
        igw_n = InternetGateway("IGW")

        with Cluster("AZ us-east-1a"):
            pub_a = VPC("public\n10.30.0.0/24")
            prv_a = VPC("private\n10.30.10.0/24")
            iso_a = VPC("isolated\n10.30.20.0/24")
            nat_n = EC2("NAT instance\nt4g.nano")

        with Cluster("AZ us-east-1b"):
            pub_b = VPC("public\n10.30.1.0/24")
            prv_b = VPC("private\n10.30.11.0/24")
            iso_b = VPC("isolated\n10.30.21.0/24")

        with Cluster("AZ us-east-1c"):
            pub_c = VPC("public\n10.30.2.0/24")
            prv_c = VPC("private\n10.30.12.0/24")
            iso_c = VPC("isolated\n10.30.22.0/24")

        with Cluster("VPC endpoints (PrivateLink)"):
            vpce_iface = Endpoint(
                "Interface (x12)\necr.api • ecr.dkr • logs • ssm\nssmmessages • ec2messages\nsecretsmanager • sts • kms\nsqs • states • events"
            )
            vpce_gw = Endpoint("Gateway\nS3  •  DynamoDB")

    # Default routes
    inet >> Edge(label="0.0.0.0/0") >> igw_n
    igw_n >> Edge(label="public RT") >> [pub_a, pub_b, pub_c]
    nat_n - pub_a
    [prv_a, prv_b, prv_c] >> Edge(label="0.0.0.0/0", style="dashed") >> nat_n

    # Endpoint attachments
    [prv_a, prv_b, prv_c] >> Edge(style="dotted") >> vpce_iface
    [prv_a, prv_b, prv_c, iso_a, iso_b, iso_c] >> Edge(style="dotted") >> vpce_gw

    # Note: isolated subnets have NO default route to internet


# ─────────────────────────────────────────────────────────────────────────────
# 4. DATA FLOW — request paths & data movement
# ─────────────────────────────────────────────────────────────────────────────
with Diagram(
    "AfriTalent — Data Flow",
    filename="aws_data_flow",
    outformat="png",
    show=False,
    graph_attr=GRAPH_ATTR,
    node_attr=NODE_ATTR,
):
    user_d = Users("User browser")
    stripe_d = ExternalSaaS("Stripe")
    fw_d = ExternalSaaS("Flutterwave")
    llm_d = ExternalSaaS("Anthropic / OpenAI")
    boards_d = ExternalSaaS("Job boards\n(Apify, Adzuna,\nGreenhouse, Lever)")

    with Cluster("Ingress"):
        cf_d = CloudFront("CloudFront")
        waf_d = WAF("WAFv2")
        alb_d = ALB("ALB\n/api/* → backend\n* → frontend")

    with Cluster("App tier"):
        fe_d = Fargate("Next.js\nfrontend")
        be_d = Fargate("Express\nbackend (API)")
        stripe_l = Lambda("webhook-stripe")
        fw_l = Lambda("webhook-flutterwave")
        sfn_d = StepFunctions("Step Functions")
        orch_l = Lambda("orchestrator-step\n(AI agents)")

    with Cluster("Persistence"):
        proxy_d = RDSProxy("RDS Proxy")
        aurora_d = Aurora("Aurora PG 15.5")
        s3_d = S3("S3 uploads\nresumes/profile/blog/trust")
        ssm_d = ParameterStore("SSM\nsecrets")

    cw_d = Cloudwatch("CloudWatch Logs")
    ses_d = SES("SES\noutbound email")

    # 1. Browser → app
    user_d >> Edge(label="1  HTTPS") >> cf_d >> waf_d >> alb_d
    alb_d >> Edge(label="2a  SSR / static") >> fe_d
    alb_d >> Edge(label="2b  /api/*") >> be_d
    fe_d >> Edge(label="3  fetch /api", style="dashed") >> be_d

    # 2. Backend reads/writes
    be_d >> Edge(label="4  SQL via proxy") >> proxy_d >> aurora_d
    be_d >> Edge(label="5  presigned PUT/GET", style="dashed") >> s3_d
    be_d >> Edge(label="6  secrets at boot", style="dotted") >> ssm_d

    # 3. AI orchestration
    be_d >> Edge(label="7  StartExecution") >> sfn_d >> Edge(label="8") >> orch_l
    orch_l >> Edge(label="9  LLM calls") >> llm_d
    orch_l >> Edge(label="10  persist AiRun", style="dashed") >> proxy_d

    # 4. Payments
    stripe_d >> Edge(label="11  webhook") >> stripe_l >> proxy_d
    fw_d >> Edge(label="11  webhook") >> fw_l >> proxy_d

    # 5. Job ingestion (egress via NAT, shown logically)
    be_d >> Edge(label="12  scrape/fetch", style="dashed") >> boards_d

    # 6. Notifications + observability
    be_d >> Edge(label="13  email", style="dotted") >> ses_d
    [be_d, fe_d, stripe_l, fw_l, orch_l, aurora_d] >> Edge(style="dotted", color="grey") >> cw_d


print("Generated: aws_architecture.png, aws_security.png, aws_network.png, aws_data_flow.png")
