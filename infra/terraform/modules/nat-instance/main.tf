terraform {
  required_version = ">= 1.6.0, < 2.0.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.70"
    }
  }
}

locals {
  name = var.name_prefix
}

# ---------------------------------------------------------------------------
# AMI lookup — fck-nat (Andrew Guenther). Open-source NAT AMI built on Amazon
# Linux 2023 (al2023) + ARM (Graviton). Owner ID 568608671756 publishes the
# AMI. As of fck-nat 1.3+ the naming is `fck-nat-al2023-hvm-*` (the older
# amzn2 line is deprecated). We pin to al2023 + arm64 + hvm + ebs and let the
# latest patch revision flow in. See https://github.com/AndrewGuenther/fck-nat.
# ---------------------------------------------------------------------------
data "aws_ami" "fck_nat" {
  most_recent = true
  owners      = ["568608671756"]

  filter {
    name   = "name"
    values = ["fck-nat-al2023-hvm-*-arm64-ebs"]
  }

  filter {
    name   = "architecture"
    values = ["arm64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }

  filter {
    name   = "root-device-type"
    values = ["ebs"]
  }
}

# ---------------------------------------------------------------------------
# IAM — instance profile with SSM Session Manager (no SSH keys)
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "ec2_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "nat" {
  name               = "${local.name}-nat-instance"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json
}

resource "aws_iam_role_policy_attachment" "nat_ssm" {
  role       = aws_iam_role.nat.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "nat" {
  name = "${local.name}-nat-instance"
  role = aws_iam_role.nat.name
}

# ---------------------------------------------------------------------------
# Network interface — disable source/dest check so it can route VPC traffic
# ---------------------------------------------------------------------------

resource "aws_network_interface" "nat" {
  subnet_id         = var.public_subnet_id
  security_groups   = var.security_group_ids
  source_dest_check = false

  tags = {
    Name = "${local.name}-nat-eni"
  }
}

# ---------------------------------------------------------------------------
# EC2 NAT instance
# ---------------------------------------------------------------------------

resource "aws_instance" "nat" {
  ami                  = data.aws_ami.fck_nat.id
  instance_type        = var.instance_type
  iam_instance_profile = aws_iam_instance_profile.nat.name

  network_interface {
    network_interface_id = aws_network_interface.nat.id
    device_index         = 0
  }

  metadata_options {
    http_tokens                 = "required"
    http_endpoint               = "enabled"
    http_put_response_hop_limit = 2
  }

  tags = {
    Name = "${local.name}-nat-instance"
  }
}

# ---------------------------------------------------------------------------
# Default route 0.0.0.0/0 in each private route table -> NAT instance ENI
# ---------------------------------------------------------------------------

resource "aws_route" "private_default_via_nat" {
  count                  = length(var.private_route_table_ids)
  route_table_id         = var.private_route_table_ids[count.index]
  destination_cidr_block = "0.0.0.0/0"
  network_interface_id   = aws_network_interface.nat.id
}
