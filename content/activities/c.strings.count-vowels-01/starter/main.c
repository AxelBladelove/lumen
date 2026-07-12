#include <stdio.h>

int main(void) {
    char line[1024];

    if (fgets(line, sizeof line, stdin) == NULL) {
        printf("0\n");
        return 0;
    }

    int count = 0;

    /* TODO: recorre line hasta '\0'. Suma 1 cuando el caracter
       actual sea una vocal minuscula: a, e, i, o o u. */

    printf("%d\n", count);
    return 0;
}
