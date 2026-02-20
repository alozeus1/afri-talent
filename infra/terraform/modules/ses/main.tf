##############################################################################
# SES — domain identity, DKIM, and IAM send policy
##############################################################################

# SES Domain identity
resource "aws_ses_domain_identity" "main" {
  domain = var.domain_name
}

# DKIM signing for the domain
resource "aws_ses_domain_dkim" "main" {
  domain = aws_ses_domain_identity.main.domain
}

# Route53 DKIM records (adds the 3 CNAME records SES needs)
resource "aws_route53_record" "dkim" {
  count   = 3
  zone_id = var.route53_zone_id
  name    = "${aws_ses_domain_dkim.main.dkim_tokens[count.index]}._domainkey"
  type    = "CNAME"
  ttl     = 600
  records = ["${aws_ses_domain_dkim.main.dkim_tokens[count.index]}.dkim.amazonses.com"]
}

# MX record for receiving (optional — for inbound email if needed)
resource "aws_route53_record" "ses_mx" {
  count   = var.add_mx_record ? 1 : 0
  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "MX"
  ttl     = 600
  records = ["10 inbound-smtp.${var.ses_region}.amazonaws.com"]
}

# IAM policy to allow ECS backend to send emails via SES
resource "aws_iam_policy" "ses_send" {
  name        = "afritalent-ses-send-${var.environment}"
  description = "Allow ECS backend to send email via SES"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ses:SendEmail", "ses:SendRawEmail"]
        Resource = "*"
        Condition = {
          StringEquals = {
            "ses:FromAddress" = "no-reply@${var.domain_name}"
          }
        }
      }
    ]
  })
}
