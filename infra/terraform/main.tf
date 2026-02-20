resource "random_password" "db" {
  length           = 24
  special          = true
  override_special = "!@#%^*()-_=+[]{}"
}

resource "random_password" "jwt" {
  length  = 64
  special = true
}

module "network" {
  source               = "./modules/network"
  name_prefix          = local.name_prefix
  az_count             = var.az_count
  vpc_cidr             = var.vpc_cidr
  public_subnet_cidrs  = var.public_subnet_cidrs
  private_subnet_cidrs = var.private_subnet_cidrs
  enable_nat_gateway   = var.enable_nat_gateway
}

module "security" {
  source        = "./modules/security"
  name_prefix   = local.name_prefix
  vpc_id        = module.network.vpc_id
  frontend_port = var.frontend_container_port
  backend_port  = var.backend_container_port
}

module "ecr" {
  source      = "./modules/ecr"
  name_prefix = local.name_prefix
}

module "rds" {
  source                   = "./modules/rds"
  name_prefix              = local.name_prefix
  private_subnet_ids       = module.network.private_subnet_ids
  rds_sg_id                = module.security.rds_sg_id
  db_name                  = var.db_name
  db_username              = var.db_username
  db_password              = random_password.db.result
  db_engine_version        = var.db_engine_version
  db_instance_class        = var.db_instance_class
  db_allocated_storage     = var.db_allocated_storage
  db_multi_az              = var.db_multi_az
  db_backup_retention_days = var.db_backup_retention_days
  db_deletion_protection   = var.db_deletion_protection
  db_skip_final_snapshot   = var.db_skip_final_snapshot
}

module "secrets" {
  source      = "./modules/secrets"
  name_prefix = local.name_prefix
  db_username = var.db_username
  db_password = random_password.db.result
  db_endpoint = module.rds.db_endpoint
  db_port     = module.rds.db_port
  db_name     = var.db_name
  jwt_secret  = random_password.jwt.result
}

module "iam_ecs" {
  source      = "./modules/iam-ecs"
  name_prefix = local.name_prefix
  secret_arn  = module.secrets.secret_arn
}

module "alb" {
  source                     = "./modules/alb"
  name_prefix                = local.name_prefix
  vpc_id                     = module.network.vpc_id
  public_subnet_ids          = module.network.public_subnet_ids
  alb_sg_id                  = module.security.alb_sg_id
  frontend_port              = var.frontend_container_port
  backend_port               = var.backend_container_port
  frontend_health_check_path = var.frontend_health_check_path
  backend_health_check_path  = var.backend_health_check_path
  acm_certificate_arn        = var.acm_certificate_arn
  api_domain_name            = var.api_domain_name
}

module "cloudfront" {
  source              = "./modules/cloudfront"
  name_prefix         = local.name_prefix
  alb_dns_name        = module.alb.alb_dns_name
  price_class         = var.cloudfront_price_class
  aliases             = var.cloudfront_aliases
  acm_certificate_arn = var.cloudfront_acm_certificate_arn
}

module "ecs" {
  source                      = "./modules/ecs"
  name_prefix                 = local.name_prefix
  aws_region                  = var.aws_region
  private_subnet_ids          = module.network.private_subnet_ids
  ecs_sg_id                   = module.security.ecs_sg_id
  frontend_image              = var.frontend_image
  backend_image               = var.backend_image
  frontend_container_port     = var.frontend_container_port
  backend_container_port      = var.backend_container_port
  frontend_container_cpu      = var.frontend_container_cpu
  frontend_container_memory   = var.frontend_container_memory
  backend_container_cpu       = var.backend_container_cpu
  backend_container_memory    = var.backend_container_memory
  frontend_desired_count      = var.frontend_desired_count
  backend_desired_count       = var.backend_desired_count
  frontend_min_capacity       = var.frontend_min_capacity
  frontend_max_capacity       = var.frontend_max_capacity
  backend_min_capacity        = var.backend_min_capacity
  backend_max_capacity        = var.backend_max_capacity
  cpu_target_utilization      = var.cpu_target_utilization
  memory_target_utilization   = var.memory_target_utilization
  log_retention_in_days       = var.log_retention_in_days
  enable_container_insights   = var.enable_container_insights
  frontend_health_check_path  = var.frontend_health_check_path
  backend_health_check_path   = var.backend_health_check_path
  frontend_target_group_arn   = module.alb.frontend_target_group_arn
  backend_target_group_arn    = module.alb.backend_target_group_arn
  secret_arn                  = module.secrets.secret_arn
  frontend_url                = local.frontend_url
  ecs_task_execution_role_arn = module.iam_ecs.execution_role_arn
  ecs_task_role_arn           = module.iam_ecs.task_role_arn
}

module "s3" {
  source          = "./modules/s3"
  bucket_name     = var.s3_uploads_bucket_name != "" ? var.s3_uploads_bucket_name : "${local.name_prefix}-uploads"
  environment     = var.environment
  allowed_origins = [local.frontend_url]
}

# Grant ECS task role access to the uploads S3 bucket
resource "aws_iam_role_policy_attachment" "ecs_task_s3" {
  role       = module.iam_ecs.task_role_name
  policy_arn = module.s3.iam_policy_arn
}

module "github_oidc" {
  source                      = "./modules/github-oidc"
  name_prefix                 = local.name_prefix
  role_name                   = local.github_role_name
  github_repo                 = var.github_repo
  github_ref                  = var.github_ref
  ecr_repository_arns         = [module.ecr.frontend_repo_arn, module.ecr.backend_repo_arn]
  ecs_cluster_arn             = module.ecs.cluster_arn
  ecs_service_arns            = [module.ecs.frontend_service_arn, module.ecs.backend_service_arn]
  ecs_task_execution_role_arn = module.iam_ecs.execution_role_arn
  ecs_task_role_arn           = module.iam_ecs.task_role_arn
  create_oidc_provider        = var.create_oidc_provider
  existing_oidc_provider_arn  = var.existing_oidc_provider_arn
  additional_policy_arn       = var.github_actions_additional_policy_arn
}
