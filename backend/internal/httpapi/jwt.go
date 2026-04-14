package httpapi

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type TokenClaims struct {
	UserID string `json:"user_id"`
	Email  string `json:"email"`
	jwt.RegisteredClaims
}

func IssueToken(jwtSecret string, userID string, email string) (string, error) {
	claims := TokenClaims{
		UserID: userID,
		Email:  email,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	t := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return t.SignedString([]byte(jwtSecret))
}

func ParseToken(jwtSecret string, tokenString string) (TokenClaims, error) {
	var out TokenClaims
	parsed, err := jwt.ParseWithClaims(tokenString, &out, func(token *jwt.Token) (any, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return []byte(jwtSecret), nil
	})
	if err != nil {
		return out, err
	}
	if !parsed.Valid {
		return out, errors.New("invalid token")
	}
	return out, nil
}

