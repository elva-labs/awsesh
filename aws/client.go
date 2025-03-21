package aws

import (
	"context"
	"fmt"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/sso"
	"github.com/aws/aws-sdk-go-v2/service/ssooidc"
	"github.com/aws/aws-sdk-go-v2/service/sts"
)

// Client wraps AWS service clients
type Client struct {
	cfg           aws.Config
	ssoClient     *sso.Client
	ssooidcClient *ssooidc.Client
	stsClient     *sts.Client
}

// NewClient initializes AWS service clients for a specific region
func NewClient(region string) (*Client, error) {
	cfg, err := config.LoadDefaultConfig(context.Background(),
		config.WithRegion(region),
	)
	if err != nil {
		return nil, fmt.Errorf("unable to load SDK config: %w", err)
	}

	return &Client{
		cfg:           cfg,
		ssoClient:     sso.NewFromConfig(cfg),
		ssooidcClient: ssooidc.NewFromConfig(cfg),
		stsClient:     sts.NewFromConfig(cfg),
	}, nil
}

// ListAccountRoles lists available roles for a specific account
func (c *Client) ListAccountRoles(ctx context.Context, accessToken string, accountID string) ([]string, error) {
	var roles []string
	var nextToken *string

	for {
		resp, err := c.ssoClient.ListAccountRoles(ctx, &sso.ListAccountRolesInput{
			AccessToken: aws.String(accessToken),
			AccountId:   aws.String(accountID),
			NextToken:   nextToken,
		})
		if err != nil {
			return nil, err
		}

		for _, role := range resp.RoleList {
			roles = append(roles, *role.RoleName)
		}

		nextToken = resp.NextToken
		if nextToken == nil {
			break
		}
	}

	return roles, nil
}

// GetRoleCredentials gets temporary credentials for a role
func (c *Client) GetRoleCredentials(ctx context.Context, accessToken, accountID, roleName string) (*sso.GetRoleCredentialsOutput, error) {
	return c.ssoClient.GetRoleCredentials(ctx, &sso.GetRoleCredentialsInput{
		AccessToken: aws.String(accessToken),
		AccountId:   aws.String(accountID),
		RoleName:    aws.String(roleName),
	})
}

// ListAccounts lists available AWS accounts
func (c *Client) ListAccounts(ctx context.Context, accessToken string) ([]Account, error) {
	var accounts []Account
	var nextToken *string

	for {
		resp, err := c.ssoClient.ListAccounts(ctx, &sso.ListAccountsInput{
			AccessToken: aws.String(accessToken),
			NextToken:   nextToken,
		})
		if err != nil {
			return nil, fmt.Errorf("failed to list accounts: %w", err)
		}

		for _, acc := range resp.AccountList {
			roles, err := c.ListAccountRoles(ctx, accessToken, *acc.AccountId)
			if err != nil {
				return nil, fmt.Errorf("failed to list roles for account %s: %w", *acc.AccountId, err)
			}

			accounts = append(accounts, Account{
				Name:      *acc.AccountName,
				AccountID: *acc.AccountId,
				Roles:     roles,
			})
		}

		nextToken = resp.NextToken
		if nextToken == nil {
			break
		}
	}

	return accounts, nil
}

// StartSSOLogin initiates the SSO login process
func (c *Client) StartSSOLogin(ctx context.Context, startUrl string) (*SSOLoginInfo, error) {
	// Register client
	registerOutput, err := c.ssooidcClient.RegisterClient(ctx, &ssooidc.RegisterClientInput{
		ClientName: aws.String("aws-sso-cli-tool"),
		ClientType: aws.String("public"),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to register OIDC client: %w", err)
	}

	// Start device authorization
	deviceAuthOutput, err := c.ssooidcClient.StartDeviceAuthorization(ctx, &ssooidc.StartDeviceAuthorizationInput{
		ClientId:     registerOutput.ClientId,
		ClientSecret: registerOutput.ClientSecret,
		StartUrl:     aws.String(startUrl),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to start device authorization: %w", err)
	}

	// Calculate expiration time
	expiresIn := time.Now().Add(time.Duration(deviceAuthOutput.ExpiresIn) * time.Second)

	return &SSOLoginInfo{
		VerificationUri:         *deviceAuthOutput.VerificationUri,
		VerificationUriComplete: *deviceAuthOutput.VerificationUriComplete,
		UserCode:                *deviceAuthOutput.UserCode,
		DeviceCode:              *deviceAuthOutput.DeviceCode,
		Interval:                deviceAuthOutput.Interval,
		ClientID:                *registerOutput.ClientId,
		ClientSecret:            *registerOutput.ClientSecret,
		ExpiresAt:               expiresIn,
		StartUrl:                startUrl,
	}, nil
}

// CreateToken attempts to create an SSO token
func (c *Client) CreateToken(ctx context.Context, info *SSOLoginInfo) (string, error) {
	tokenInput := &ssooidc.CreateTokenInput{
		ClientId:     &info.ClientID,
		ClientSecret: &info.ClientSecret,
		DeviceCode:   &info.DeviceCode,
		GrantType:    aws.String("urn:ietf:params:oauth:grant-type:device_code"),
	}

	tokenOutput, err := c.ssooidcClient.CreateToken(ctx, tokenInput)
	if err != nil {
		return "", err
	}

	if tokenOutput != nil && tokenOutput.AccessToken != nil {
		return *tokenOutput.AccessToken, nil
	}

	return "", nil
}

// Region returns the configured AWS region
func (c *Client) Region() string {
	return c.cfg.Region
}
