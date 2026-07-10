#include <stdio.h>

int main(void) {
    char line[1024];

    if (fgets(line, sizeof line, stdin) == NULL) {
        printf("0\n");
        return 0;
    }

    int count = 0;

    /* TODO: recorre la cadena hasta el terminador '\0'
       y suma 1 por cada caracter entre 'a' y 'z'. */

    printf("%d\n", count);
    return 0;
}
