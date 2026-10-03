package main

import (
	"encoding/json"
	"os"
	"regexp"
	"strings"
)

// Larine context is deployment configuration, not a HomeBox entity ID. Operators
// must supply the canonical Work Item projection ID; never substitute a native
// Enhancement ID or derive a Work Item from a Statement-scoped launch.
// These generic variables intentionally do not use the HBOX config prefix.
type larineContext struct {
	activeWorkItemID string
	statementID      string
}

func larineContextFromEnvironment() larineContext {
	return larineContext{
		activeWorkItemID: os.Getenv("LARINE_ACTIVE_WORK_ITEM_ID"),
		statementID:      os.Getenv("LARINE_STATEMENT_ID"),
	}
}

var htmlHeadOpen = regexp.MustCompile(`(?i)<head(?:\s[^>]*)?>`)

// injectHTML runs at the Go static-serving boundary, not Nuxt generation time.
// A synchronous inline bootstrap is the first child of head so even a future
// non-deferred widget script cannot initialize before these globals exist.
func (c larineContext) injectHTML(html []byte) []byte {
	var bootstrap strings.Builder
	for _, value := range []struct{ name, id string }{
		{"__LARINE_ACTIVE_WORK_ITEM_ID__", c.activeWorkItemID},
		{"__LARINE_STATEMENT_ID__", c.statementID},
	} {
		if strings.TrimSpace(value.id) == "" {
			continue
		}
		// json.Marshal on strings escapes quotes, control characters, <, >, &,
		// and U+2028/U+2029. In particular </script> becomes \u003c/script\u003e,
		// which cannot terminate the surrounding HTML script element.
		encoded, _ := json.Marshal(value.id)
		bootstrap.WriteString("window.")
		bootstrap.WriteString(value.name)
		bootstrap.WriteByte('=')
		bootstrap.Write(encoded)
		bootstrap.WriteByte(';')
	}
	if bootstrap.Len() == 0 {
		return html
	}
	location := htmlHeadOpen.FindIndex(html)
	if location == nil {
		// Non-page HTML assets are left unchanged. Nuxt's generated app shell
		// always has a head; do not prepend scripts before a document's doctype.
		return html
	}
	script := "<script>" + bootstrap.String() + "</script>"
	result := make([]byte, 0, len(html)+len(script))
	result = append(result, html[:location[1]]...)
	result = append(result, script...)
	return append(result, html[location[1]:]...)
}
