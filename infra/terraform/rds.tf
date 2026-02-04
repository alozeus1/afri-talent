resource "aws_db_subnet_group" "main" {
  name       = "${local.name_prefix}-db-subnet"
  subnet_ids = aws_subnet.private[*].id

  tags = {
    Name = "${local.name_prefix}-db-subnet"
  }
}

resource "aws_db_instance" "postgres" {
  identifier              = "${local.name_prefix}-postgres"
  engine                  = "postgres"
  engine_version          = var.db_engine_version
  instance_class          = var.db_instance_class
  allocated_storage       = var.db_allocated_storage
  db_name                 = var.db_name
  username                = var.db_username
  password                = random_password.db.result
  multi_az                = var.db_multi_az
  storage_encrypted       = true
  backup_retention_period = var.db_backup_retention_days
  deletion_protection     = var.db_deletion_protection
  skip_final_snapshot     = var.db_skip_final_snapshot
  publicly_accessible     = false
  db_subnet_group_name    = aws_db_subnet_group.main.name
  vpc_security_group_ids  = [aws_security_group.rds.id]

  tags = {
    Name = "${local.name_prefix}-postgres"
  }
}

